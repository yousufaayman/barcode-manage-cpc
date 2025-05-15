use barcode_management;

SELECT * FROM batches ;

SELECT * FROM batches WHERE current_phase = 1 AND status = "In Progress";

SELECT * FROM batches 
WHERE (current_phase = 1 AND status = 'Completed') 
   OR (current_phase = 2 AND status = 'Completed');
   
UPDATE batches
SET 
  current_phase = CASE 
    WHEN current_phase = 1 AND status = 'Completed' THEN 2
    WHEN current_phase = 2 AND status = 'Completed' THEN 3
    ELSE current_phase
  END,
  status = CASE
    WHEN (current_phase = 1 OR current_phase = 2) AND status = 'Completed' THEN 'Pending'
    ELSE status
  END
WHERE (current_phase = 1 OR current_phase = 2) AND status = 'Completed';

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

DELIMITER ;