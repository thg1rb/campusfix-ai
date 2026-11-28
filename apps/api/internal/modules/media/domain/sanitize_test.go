package domain

import (
	"bytes"
	"encoding/binary"
	"errors"
	"hash/crc32"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"math/rand/v2"
	"testing"
)

// TIFF IFD0 with camera make, model, orientation, and a GPS IFD containing longitude.
func testEXIF() []byte {
	const textOffset = 62
	const gpsOffset = 78
	data := make([]byte, 120)
	copy(data, "II*\x00\x08\x00\x00\x00")
	order := binary.LittleEndian
	order.PutUint16(data[8:], 4)
	entry := func(offset int, tag, typ uint16, count, value uint32) {
		order.PutUint16(data[offset:], tag)
		order.PutUint16(data[offset+2:], typ)
		order.PutUint32(data[offset+4:], count)
		order.PutUint32(data[offset+8:], value)
	}
	entry(10, 0x010f, 2, 8, textOffset)
	entry(22, 0x0110, 2, 8, textOffset+8)
	entry(34, 0x0112, 3, 1, 6)
	entry(46, 0x8825, 4, 1, gpsOffset)
	copy(data[textOffset:], "TestCam\x00Model-X\x00")
	order.PutUint16(data[gpsOffset:], 1)
	entry(gpsOffset+2, 0x0004, 5, 3, 96)
	for offset, value := range []uint32{100, 1, 34, 1, 12, 1} {
		order.PutUint32(data[96+offset*4:], value)
	}
	return data
}

func jpegSegment(marker byte, payload []byte) []byte {
	return append(binary.BigEndian.AppendUint16([]byte{0xff, marker}, uint16(len(payload)+2)), payload...)
}

func TestSanitizeJPEGRemovesMetadataAndRotates(t *testing.T) {
	img := image.NewRGBA(image.Rect(0, 0, 80, 48))
	for y := range 48 {
		for x := range 80 {
			if x < 40 {
				img.SetRGBA(x, y, color.RGBA{R: 255, A: 255})
			} else {
				img.SetRGBA(x, y, color.RGBA{B: 255, A: 255})
			}
		}
	}
	var original bytes.Buffer
	if err := jpeg.Encode(&original, img, nil); err != nil {
		t.Fatal(err)
	}
	raw := bytes.Clone(original.Bytes()[:2])
	raw = append(raw, jpegSegment(0xe1, append([]byte("Exif\x00\x00"), testEXIF()...))...)
	raw = append(raw, jpegSegment(0xe1, []byte("http://ns.adobe.com/xap/1.0/\x00XMP"))...)
	raw = append(raw, jpegSegment(0xed, []byte("IPTC TestCam"))...)
	raw = append(raw, jpegSegment(0xfe, []byte("test comment"))...)
	raw = append(raw, original.Bytes()[2:]...)
	if got := jpegOrientation(raw); got != 6 {
		t.Fatalf("fixture orientation = %d", got)
	}
	data, mimeType, err := Sanitize(raw)
	if err != nil || mimeType != MIMEJPEG {
		t.Fatalf("sanitize: %s %v", mimeType, err)
	}
	for _, marker := range []byte{0xe1, 0xed, 0xfe} {
		if bytes.Contains(data, []byte{0xff, marker}) {
			t.Errorf("retained JPEG metadata marker 0x%x", marker)
		}
	}
	decoded, err := jpeg.Decode(bytes.NewReader(data))
	if err != nil {
		t.Fatal(err)
	}
	if decoded.Bounds().Size() != image.Pt(48, 80) {
		t.Fatalf("rotated dimensions: %v", decoded.Bounds())
	}
	r, _, b, _ := decoded.At(24, 12).RGBA()
	r2, _, b2, _ := decoded.At(24, 68).RGBA()
	if r <= b || r2 >= b2 {
		t.Fatal("orientation did not rotate red-left/blue-right clockwise")
	}
}

func TestAllOrientations(t *testing.T) {
	src := image.NewGray(image.Rect(0, 0, 3, 2))
	copy(src.Pix, []byte{1, 2, 3, 4, 5, 6})
	for i, want := range [][]byte{
		{1, 2, 3, 4, 5, 6}, {3, 2, 1, 6, 5, 4}, {6, 5, 4, 3, 2, 1}, {4, 5, 6, 1, 2, 3},
		{1, 4, 2, 5, 3, 6}, {4, 1, 5, 2, 6, 3}, {6, 3, 5, 2, 4, 1}, {3, 6, 2, 5, 1, 4},
	} {
		dst := orient(src, i+1)
		var got []byte
		for y := range dst.Bounds().Dy() {
			for x := range dst.Bounds().Dx() {
				red, _, _, _ := dst.At(x, y).RGBA()
				got = append(got, byte(red))
			}
		}
		if !bytes.Equal(got, want) {
			t.Errorf("orientation %d: got %v, want %v", i+1, got, want)
		}
	}
}

func pngChunk(name string, data []byte) []byte {
	chunk := binary.BigEndian.AppendUint32(nil, uint32(len(data)))
	chunk = append(chunk, name...)
	chunk = append(chunk, data...)
	return binary.BigEndian.AppendUint32(chunk, crc32.ChecksumIEEE(chunk[4:]))
}

func TestSanitizePNGRemovesMetadata(t *testing.T) {
	var original bytes.Buffer
	if err := png.Encode(&original, image.NewRGBA(image.Rect(0, 0, 4, 3))); err != nil {
		t.Fatal(err)
	}
	raw := bytes.Clone(original.Bytes()[:33])
	raw = append(raw, pngChunk("tEXt", []byte("Author\x00private-name"))...)
	raw = append(raw, pngChunk("eXIf", testEXIF())...)
	raw = append(raw, original.Bytes()[33:]...)
	data, mimeType, err := Sanitize(raw)
	if err != nil || mimeType != MIMEPNG {
		t.Fatalf("sanitize: %s %v", mimeType, err)
	}
	for _, marker := range []string{"tEXt", "eXIf", "private-name", "TestCam"} {
		if bytes.Contains(data, []byte(marker)) {
			t.Errorf("retained PNG metadata %s", marker)
		}
	}
	if _, err := png.Decode(bytes.NewReader(data)); err != nil {
		t.Fatal(err)
	}
}

func TestValidation(t *testing.T) {
	bomb := func(width, height uint32) []byte {
		header := binary.BigEndian.AppendUint32(nil, width)
		header = binary.BigEndian.AppendUint32(header, height)
		header = append(header, 8, 2, 0, 0, 0)
		return append(bytes.Clone(pngSignature), pngChunk("IHDR", header)...)
	}
	for _, tc := range []struct {
		name string
		data []byte
		want error
	}{
		{"empty", nil, ErrInvalidMediaFormat},
		{"text", []byte("plain text"), ErrInvalidMediaFormat},
		{"svg", []byte("<svg/>"), ErrInvalidMediaFormat},
		{"gif", []byte("GIF89a"), ErrInvalidMediaFormat},
		{"pdf", []byte("%PDF-1.7"), ErrInvalidMediaFormat},
		{"oversized", make([]byte, MaxImageBytes+1), ErrMediaTooLarge},
		{"corrupt", pngSignature, ErrImageCorrupt},
		{"axis limit", bomb(10001, 1), ErrImageDimensionsExceeded},
		{"pixel limit", bomb(8000, 8000), ErrImageDimensionsExceeded},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if _, _, err := Sanitize(tc.data); !errors.Is(err, tc.want) {
				t.Fatalf("got %v, want %v", err, tc.want)
			}
		})
	}
}

func TestSanitizeLargeValidPNG(t *testing.T) {
	src := image.NewGray(image.Rect(0, 0, 2800, 2800))
	rng := rand.NewPCG(20, 44)
	for i := range src.Pix {
		src.Pix[i] = byte(rng.Uint64())
	}
	var original bytes.Buffer
	if err := png.Encode(&original, src); err != nil {
		t.Fatal(err)
	}
	if original.Len() <= 5<<20 || original.Len() > MaxImageBytes {
		t.Fatalf("test PNG size %d is outside the intended range", original.Len())
	}
	if data, _, err := Sanitize(original.Bytes()); err != nil || len(data) == 0 {
		t.Fatalf("sanitize large image: %v", err)
	}
}
