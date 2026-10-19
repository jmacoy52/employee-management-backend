-- Optional link between an employee record and the user account that belongs to it.
-- One account per employee record; unlinking happens automatically if the account is deleted.
ALTER TABLE employees
  ADD COLUMN user_id INT NULL DEFAULT NULL,
  ADD UNIQUE KEY uq_employees_user_id (user_id),
  ADD CONSTRAINT fk_employees_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
