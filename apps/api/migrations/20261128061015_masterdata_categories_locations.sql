-- +goose Up
CREATE TABLE categories (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    description text NOT NULL DEFAULT '',
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX categories_name_key ON categories (lower(name));
CREATE INDEX categories_active_idx ON categories (is_active);

CREATE TABLE campus_locations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    type text NOT NULL CHECK (type IN ('BUILDING','COMMON_AREA','ROAD','ACTIVITY_PLAZA','SERVICE_POINT','LANDMARK')),
    lat double precision NOT NULL CHECK (lat BETWEEN 13.839000 AND 13.858000),
    lng double precision NOT NULL CHECK (lng BETWEEN 100.557000 AND 100.580000),
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX campus_locations_name_key ON campus_locations (lower(name));
CREATE INDEX campus_locations_active_idx ON campus_locations (is_active);
CREATE INDEX campus_locations_type_idx ON campus_locations (type);

INSERT INTO categories (id, name, description) VALUES
('c9de655b-4f30-4fb6-8edf-000000000101', 'อาคารและสถานที่', 'อาคารและสถานที่'),
('c9de655b-4f30-4fb6-8edf-000000000102', 'ไฟฟ้าและแสงสว่าง', 'ไฟฟ้าและแสงสว่าง'),
('c9de655b-4f30-4fb6-8edf-000000000103', 'ความสะอาด', 'ความสะอาด'),
('c9de655b-4f30-4fb6-8edf-000000000104', 'อินเทอร์เน็ตและระบบสารสนเทศ', 'อินเทอร์เน็ตและระบบสารสนเทศ'),
('c9de655b-4f30-4fb6-8edf-000000000105', 'ความปลอดภัย', 'ความปลอดภัย'),
('c9de655b-4f30-4fb6-8edf-000000000106', 'อื่น ๆ', 'อื่น ๆ');

INSERT INTO campus_locations (id, name, type, lat, lng) VALUES
('c9de655b-4f30-4fb6-8edf-000000000201', 'อาคารเรียนรวม 1 (ศร.1)', 'BUILDING', 13.847187, 100.571153),
('c9de655b-4f30-4fb6-8edf-000000000202', 'อาคารเรียนรวม 3 (ศร.3)', 'BUILDING', 13.849201, 100.569406),
('c9de655b-4f30-4fb6-8edf-000000000203', 'บริเวณหอพักนิสิตชาย', 'BUILDING', 13.848696, 100.568118),
('c9de655b-4f30-4fb6-8edf-000000000204', 'สำนักหอสมุด มก.', 'BUILDING', 13.847654, 100.571816),
('c9de655b-4f30-4fb6-8edf-000000000205', 'อาคารชูชาติ กำภู (คณะวิศวกรรมศาสตร์)', 'BUILDING', 13.845555, 100.570083),
('c9de655b-4f30-4fb6-8edf-000000000206', 'ศูนย์อาหารกลาง 1 (บาร์ใหม่)', 'COMMON_AREA', 13.848753, 100.567067),
('c9de655b-4f30-4fb6-8edf-000000000207', 'อาคารจักรพันธ์เพ็ญศิริ', 'BUILDING', 13.849743, 100.568307),
('c9de655b-4f30-4fb6-8edf-000000000208', 'ถนนชูชาติกำภู (แนวทางเดินหลัก)', 'ROAD', 13.848324, 100.570564),
('c9de655b-4f30-4fb6-8edf-000000000209', 'ลานจอดรถหน้าอาคารสำนักบริการคอมพิวเตอร์', 'SERVICE_POINT', 13.844589, 100.567328),
('c9de655b-4f30-4fb6-8edf-000000000210', 'ลานอนุสาวรีย์สามบูรพาจารย์', 'ACTIVITY_PLAZA', 13.842281, 100.573087);

-- +goose Down
DROP TABLE campus_locations, categories;
