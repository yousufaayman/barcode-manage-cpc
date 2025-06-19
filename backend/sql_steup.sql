use barcode_management;
select * from batches;

DELIMITER //
CREATE TRIGGER handle_phase_transitions
BEFORE UPDATE ON batches
FOR EACH ROW
BEGIN
    -- If changing to phase 1 (Cutting) and status 'Completed'
    IF NEW.current_phase = 1 AND NEW.status = 'Completed' THEN
        -- Then set it to phase 2 (Sewing) and status 'Pending' instead
        SET NEW.current_phase = 2;
        SET NEW.status = 'Pending';
    
    -- If changing to phase 2 (Sewing) and status 'Completed'
    ELSEIF NEW.current_phase = 2 AND NEW.status = 'Completed' THEN
        -- Then set it to phase 3 (Packaging) and status 'Pending' instead
        SET NEW.current_phase = 3;
        SET NEW.status = 'Pending';
    
    -- For phase 3 (Packaging) and Completed, we keep it as-is
    END IF;
END //



-- Modify the existing column to have the correct default and update behavior
ALTER TABLE batches 
MODIFY COLUMN last_updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

-- Update any NULL values
UPDATE batches 
SET last_updated_at = CURRENT_TIMESTAMP 
WHERE last_updated_at IS NULL;


-- Create the archived_batches table
CREATE TABLE archived_batches (
    batch_id INT PRIMARY KEY,
    barcode VARCHAR(255) UNIQUE,
    brand_id INT,
    model_id INT,
    size_id INT,
    color_id INT,
    quantity INT,
    layers INT,
    serial INT,
    current_phase INT,
    status VARCHAR(50),
    last_updated_at DATETIME,
    archived_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (brand_id) REFERENCES brands(brand_id),
    FOREIGN KEY (model_id) REFERENCES models(model_id),
    FOREIGN KEY (size_id) REFERENCES sizes(size_id),
    FOREIGN KEY (color_id) REFERENCES colors(color_id),
    FOREIGN KEY (current_phase) REFERENCES production_phases(phase_id)
);

-- Create a stored procedure to archive old batches
DELIMITER //

CREATE PROCEDURE archive_old_batches()
BEGIN
    -- Start transaction to ensure data consistency
    START TRANSACTION;
    
    -- Insert batches that haven't been updated in 3 months into archived_batches
    INSERT INTO archived_batches (
        batch_id, barcode, brand_id, model_id, size_id, color_id,
        quantity, layers, serial, current_phase, status, last_updated_at
    )
    SELECT 
        batch_id, barcode, brand_id, model_id, size_id, color_id,
        quantity, layers, serial, current_phase, status, last_updated_at
    FROM batches
    WHERE last_updated_at < DATE_SUB(NOW(), INTERVAL 3 MONTH)
    AND batch_id NOT IN (SELECT batch_id FROM archived_batches);

    -- Delete the archived batches from the original table
    DELETE FROM batches
    WHERE last_updated_at < DATE_SUB(NOW(), INTERVAL 3 MONTH);
    
    -- Commit the transaction
    COMMIT;
END //

DELIMITER ;

-- Create an event to run the archiving procedure automatically
CREATE EVENT archive_batches_event
ON SCHEDULE EVERY 1 DAY
DO
    CALL archive_old_batches();


CREATE TABLE barcode_status_timeline (
    id INT AUTO_INCREMENT PRIMARY KEY,
    batch_id INT,  -- Changed from barcode_id to batch_id
    status VARCHAR(50),  -- 'in', 'out', 'pending'
    phase_id INT,  -- Changed from phase to phase_id to match the schema
    start_time DATETIME,
    end_time DATETIME,
    duration_minutes INT,
    FOREIGN KEY (batch_id) REFERENCES batches(batch_id),
    FOREIGN KEY (phase_id) REFERENCES production_phases(phase_id)
);

Select * from barcode_status_timeline;