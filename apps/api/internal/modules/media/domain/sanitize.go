package domain

import (
	"bytes"
	"encoding/binary"
	"errors"
	"image"
	"image/jpeg"
	"image/png"
	"io"
)

const (
	maxDimension = 10000
	maxPixels    = 40_000_000
)

var pngSignature = []byte{0x89, 'P', 'N', 'G', 13, 10, 26, 10}
var jpegSignature = []byte{0xff, 0xd8, 0xff}

func Sanitize(raw []byte) (data []byte, mimeType string, err error) {
	if len(raw) > MaxImageBytes {
		return nil, "", ErrMediaTooLarge
	}
	var decodeConfig func(io.Reader) (image.Config, error)
	var decode func(io.Reader) (image.Image, error)
	var encode func(io.Writer, image.Image) error
	switch {
	case bytes.HasPrefix(raw, pngSignature):
		mimeType, decodeConfig, decode, encode = MIMEPNG, png.DecodeConfig, png.Decode, png.Encode
	case bytes.HasPrefix(raw, jpegSignature):
		mimeType, decodeConfig, decode = MIMEJPEG, jpeg.DecodeConfig, jpeg.Decode
		encode = func(w io.Writer, pixels image.Image) error {
			return jpeg.Encode(w, orient(pixels, jpegOrientation(raw)), &jpeg.Options{Quality: 88})
		}
	default:
		return nil, "", ErrInvalidMediaFormat
	}
	cfg, err := decodeConfig(bytes.NewReader(raw))
	if err != nil || cfg.Width <= 0 || cfg.Height <= 0 {
		return nil, "", ErrImageCorrupt
	}
	if cfg.Width > maxDimension || cfg.Height > maxDimension || cfg.Width*cfg.Height > maxPixels {
		return nil, "", ErrImageDimensionsExceeded
	}
	pixels, err := decode(bytes.NewReader(raw))
	if err != nil {
		return nil, "", ErrImageCorrupt
	}
	var output imageBuffer
	if err := encode(&output, pixels); err != nil {
		if errors.Is(err, ErrMediaTooLarge) {
			return nil, "", ErrMediaTooLarge
		}
		return nil, "", err
	}
	return output.Bytes(), mimeType, nil
}

type imageBuffer struct{ bytes.Buffer }

func (b *imageBuffer) Write(p []byte) (int, error) {
	if len(p) > MaxImageBytes-b.Len() {
		return 0, ErrMediaTooLarge
	}
	return b.Buffer.Write(p)
}

func jpegOrientation(raw []byte) int {
	// Read APP1 segments before the compressed scan. Invalid metadata does not prevent decoding pixels.
	for data := raw[2:]; len(data) > 0 && data[0] == 0xff; {
		for len(data) > 0 && data[0] == 0xff {
			data = data[1:]
		}
		if len(data) < 3 || data[0] == 0xda || data[0] == 0xd9 {
			break
		}
		marker := data[0]
		if marker == 0x01 || marker >= 0xd0 && marker <= 0xd7 {
			data = data[1:]
			continue
		}
		length := int(binary.BigEndian.Uint16(data[1:3]))
		if length < 2 || length >= len(data) {
			break
		}
		payload := data[3 : length+1]
		if marker == 0xe1 && bytes.HasPrefix(payload, []byte("Exif\x00\x00")) {
			if value := tiffOrientation(payload[6:]); value != 0 {
				return value
			}
		}
		data = data[length+1:]
	}
	return 1
}

func tiffOrientation(tiff []byte) int {
	if len(tiff) < 8 {
		return 0
	}
	var endian binary.ByteOrder
	switch string(tiff[:2]) {
	case "II":
		endian = binary.LittleEndian
	case "MM":
		endian = binary.BigEndian
	default:
		return 0
	}
	if endian.Uint16(tiff[2:4]) != 42 {
		return 0
	}
	offset := uint64(endian.Uint32(tiff[4:8]))
	if offset < 8 || offset+2 > uint64(len(tiff)) {
		return 0
	}
	dir := tiff[offset:]
	count := int(endian.Uint16(dir[:2]))
	if count > (len(dir)-2)/12 {
		return 0
	}
	for i := range count {
		tag := dir[2+12*i : 2+12*(i+1)]
		if endian.Uint16(tag[:2]) == 0x0112 && endian.Uint16(tag[2:4]) == 3 && endian.Uint32(tag[4:8]) == 1 {
			value := int(endian.Uint16(tag[8:10]))
			if value >= 1 && value <= 8 {
				return value
			}
		}
	}
	return 0
}

func orient(src image.Image, orientation int) image.Image {
	if orientation <= 1 || orientation > 8 {
		return src
	}
	bounds := src.Bounds()
	w, h := bounds.Dx(), bounds.Dy()
	size := image.Pt(w, h)
	if orientation >= 5 {
		size = image.Pt(h, w)
	}
	dst := image.NewRGBA(image.Rectangle{Max: size})
	for y := range h {
		for x := range w {
			var dx, dy int
			switch orientation {
			case 2:
				dx, dy = w-1-x, y
			case 3:
				dx, dy = w-1-x, h-1-y
			case 4:
				dx, dy = x, h-1-y
			case 5:
				dx, dy = y, x
			case 6:
				dx, dy = h-1-y, x
			case 7:
				dx, dy = h-1-y, w-1-x
			case 8:
				dx, dy = y, w-1-x
			}
			dst.Set(dx, dy, src.At(bounds.Min.X+x, bounds.Min.Y+y))
		}
	}
	return dst
}
