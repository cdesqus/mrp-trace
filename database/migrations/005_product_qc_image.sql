BEGIN;

ALTER TABLE m_products
    ADD COLUMN IF NOT EXISTS qc_image_data_url TEXT;

COMMIT;
