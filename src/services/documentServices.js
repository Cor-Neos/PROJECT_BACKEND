// ------------------- SERVICES or QUERIES FOR DOCUMENTS

import { query } from "../db.js";
import {
  encryptFile,
  decryptToStream,
} from "../utils/encryption.js";
import fs from "fs";
import path from "path";

import bcrypt from "bcrypt";
const saltRounds = 10;

// Get all documents (excluding deleted ones)
export const getDocuments = async () => {
  const { rows } = await query(
    `SELECT d.* FROM document_tbl d 
     JOIN case_tbl c ON d.case_id = c.case_id
     WHERE c.case_status != 'Archived (Completed)' AND c.case_status != 'Archived (Dismissed)' 
     AND c.case_status != 'Dismissed' AND c.case_status != 'Completed'
     AND (d.is_deleted IS NULL OR d.is_deleted = false)
     ORDER BY doc_id DESC`
  );
  return rows;
};

// Get all documents of lawyer's cases (excluding deleted ones)
export const getDocumentsByLawyer = async (lawyerId) => {
  const { rows } = await query(
    `SELECT d.* FROM document_tbl d
     JOIN case_tbl c ON d.case_id = c.case_id
      WHERE c.user_id = $1
      AND (d.is_deleted IS NULL OR d.is_deleted = false)
      ORDER BY d.doc_id DESC`,
    [lawyerId]
  );
  return rows;
};

// Get a single document by ID
export const getDocumentById = async (docId) => {
  const { rows } = await query("SELECT * FROM document_tbl WHERE doc_id = $1", [
    docId,
  ]);
  return rows[0];
};

// Get documents by Case ID (excluding deleted ones)
export const getDocumentsByCaseId = async (caseId) => {
  const { rows } = await query(
    "SELECT * FROM document_tbl WHERE case_id = $1 AND (is_deleted IS NULL OR is_deleted = false) ORDER BY doc_id ASC",
    [caseId]
  );
  return rows;
};

// Get documents submitted by a specific user (excluding deleted ones)
export const getDocumentsBySubmitter = async (userId) => {
  const { rows } = await query(
    "SELECT * FROM document_tbl WHERE doc_submitted_by = $1 AND (is_deleted IS NULL OR is_deleted = false) ORDER BY doc_id DESC",
    [userId]
  );
  return rows;
};

// Get all task documents assigned to (staff/paralegal) or tasked by (admin/lawyer) a specific user
export const getTaskDocumentsByUser = async (userId) => {
  const sql = `
    SELECT DISTINCT d.*, c.case_id, c.case_status, c.user_id AS case_user_id
    FROM document_tbl d
    LEFT JOIN case_tbl c ON d.case_id = c.case_id
    WHERE d.doc_type = 'Task'
      AND (
        d.doc_tasked_to = $1
        OR d.doc_tasked_by = $1
        OR c.user_id = $1
      )
      AND (c.case_status NOT IN ('Archived (Completed)', 'Archived (Dismissed)', 'Completed', 'Dismissed') OR c.case_status IS NULL)
      AND (d.is_deleted IS NULL OR d.is_deleted = false)
    ORDER BY d.doc_id DESC;
  `;

  const { rows } = await query(sql, [userId]);
  return rows;
};

// Create a new document
export const createDocument = async (docData) => {
  const {
    doc_name,
    doc_type, // "Support Document" | "Task Document"
    doc_description = null,
    doc_task = null,
    doc_file = null,
    doc_prio_level = null,
    doc_due_date = null,
    doc_status = null,
    doc_tag = null,
    doc_password = null,
    doc_tasked_to = null,
    doc_tasked_by = null,
    doc_submitted_by = null,
    doc_reference = null,
    case_id = null,
  } = docData;

  if (!doc_name || !doc_type) {
    throw new Error("doc_name and doc_type are required");
  }

  const hashedPassword = doc_password
    ? await bcrypt.hash(doc_password.toString(), saltRounds)
    : null;

  const queryStr = `
    INSERT INTO document_tbl (
      doc_name, doc_type, doc_description, doc_task, doc_file,
      doc_prio_level, doc_due_date, doc_status, doc_tag, doc_password,
      doc_tasked_to, doc_tasked_by, doc_submitted_by, doc_reference, case_id
    ) VALUES (
      $1, $2, $3, $4, $5,
      $6, $7, $8, $9, $10,
      $11, $12, $13, $14, $15
    ) RETURNING *;
  `;

  const params = [
    doc_name,
    doc_type,
    doc_description,
    doc_task,
    doc_file,
    doc_prio_level,
    doc_due_date,
    doc_status,
    doc_tag,
    hashedPassword,
    doc_tasked_to,
    doc_tasked_by,
    doc_submitted_by,
    doc_reference,
    case_id,
  ];

  const { rows } = await query(queryStr, params);
  return rows[0];
};

// Update a document
export const updateDocument = async (docId, docData) => {
  const {
    doc_name,
    doc_type,
    doc_description,
    doc_task,
    doc_file,
    doc_prio_level,
    doc_due_date,
    doc_date_submitted,
    doc_status,
    doc_tag,
    doc_password,
    doc_tasked_to,
    doc_tasked_by,
    doc_submitted_by,
    doc_reference,
    doc_last_updated_by,
    is_trashed,
    doc_trashed_by,
    doc_trashed_date,
    case_id,
  } = docData;

  const hashedPassword = doc_password
    ? await bcrypt.hash(doc_password.toString(), saltRounds)
    : null;
  const queryStr = `
    UPDATE document_tbl SET
      doc_name = COALESCE($1, doc_name),
      doc_type = COALESCE($2, doc_type),
      doc_description = COALESCE($3, doc_description),
      doc_task = COALESCE($4, doc_task),
      doc_file = COALESCE($5, doc_file),
      doc_prio_level = COALESCE($6, doc_prio_level),
      doc_due_date = COALESCE($7, doc_due_date),
      doc_date_submitted = COALESCE($8, doc_date_submitted),
      doc_status = COALESCE($9, doc_status),
      doc_tag = COALESCE($10, doc_tag),
      doc_password = COALESCE($11, doc_password),
      doc_tasked_to = COALESCE($12, doc_tasked_to),
      doc_tasked_by = COALESCE($13, doc_tasked_by),
      doc_submitted_by = COALESCE($14, doc_submitted_by),
      doc_reference = COALESCE($15::jsonb, doc_reference),
      doc_last_updated_by = COALESCE($16, doc_last_updated_by),
      doc_trashed_by = COALESCE($17, doc_trashed_by),
      doc_trashed_date = COALESCE($18, doc_trashed_date),
      is_trashed = COALESCE($19, is_trashed),
      case_id = COALESCE($20, case_id)
    WHERE doc_id = $21
    RETURNING *;
  `;

  const params = [
    doc_name,
    doc_type,
    doc_description,
    doc_task,
    doc_file,
    doc_prio_level,
    doc_due_date,
    doc_date_submitted,
    doc_status,
    doc_tag,
    hashedPassword,
    doc_tasked_to,
    doc_tasked_by,
    doc_submitted_by,
    doc_reference,
    doc_last_updated_by,
    doc_trashed_by,
    doc_trashed_date,
    is_trashed,
    case_id,
    docId,
  ];

  const { rows } = await query(queryStr, params);
  return rows[0];
};

// Soft delete a document (move to trash)
export const deleteDocument = async (docId, userId) => {
  const { rows } = await query(
    `UPDATE document_tbl 
     SET is_deleted = true, 
         doc_deleted_date = NOW(), 
         doc_deleted_by = $2
     WHERE doc_id = $1 
     RETURNING *`,
    [docId, userId]
  );
  return rows[0];
};

// Restore a deleted document from trash
export const restoreDocument = async (docId) => {
  const { rows } = await query(
    `UPDATE document_tbl 
     SET is_deleted = false, 
         doc_deleted_date = NULL, 
         doc_deleted_by = NULL
     WHERE doc_id = $1 
     RETURNING *`,
    [docId]
  );
  return rows[0];
};

// Permanently delete a document from database
export const permanentDeleteDocument = async (docId) => {
  const { rows } = await query(
    "DELETE FROM document_tbl WHERE doc_id = $1 RETURNING *",
    [docId]
  );
  return rows[0];
};

// Get all deleted documents for trash view
export const getDeletedDocuments = async () => {
  const { rows } = await query(
    `SELECT d.*, 
            ct.ct_name as case_name,
            u.user_fname || ' ' || COALESCE(u.user_mname, '') || ' ' || u.user_lname as deleted_by_name
     FROM document_tbl d
     LEFT JOIN case_tbl c ON d.case_id = c.case_id
     LEFT JOIN cc_type_tbl ct ON c.ct_id = ct.ct_id
     LEFT JOIN user_tbl u ON d.doc_deleted_by = u.user_id
     WHERE d.is_deleted = true
     ORDER BY d.doc_deleted_date DESC`
  );
  return rows;
};

// Simple search by name / tag / status (excluding deleted documents)
export const searchDocuments = async (term) => {
  const like = `%${term}%`;
  const { rows } = await query(
    `SELECT * FROM document_tbl
     WHERE (doc_name ILIKE $1 OR COALESCE(doc_tag,'') ILIKE $1 OR COALESCE(doc_status,'') ILIKE $1)
     AND (is_deleted IS NULL OR is_deleted = false)
     ORDER BY doc_id DESC`,
    [like]
  );
  return rows;
};

// count for approval documents with status "done" for dashboard
export const countForApprovalDocuments = async () => {
  const { rows } = await query(
    `SELECT COUNT(*) FROM document_tbl WHERE doc_status = 'done' AND (is_deleted IS NULL OR is_deleted = false)`
  );
  return rows[0].count;
};

// count of the processing documents where the status of its case_id is "processing"
export const countProcessingDocuments = async () => {
  const { rows } = await query(
    `SELECT COUNT(*) FROM document_tbl d
      JOIN case_tbl c ON d.case_id = c.case_id
      WHERE c.case_status = 'Processing'
      AND (d.is_deleted IS NULL OR d.is_deleted = false)`
  );
  return rows[0].count;
};

// count processing documents of a lawyer's cases
export const countProcessingDocumentsByLawyer = async (lawyerId) => {
  const { rows } = await query(
    `SELECT COUNT(*) FROM document_tbl d
      JOIN case_tbl c ON d.case_id = c.case_id
      WHERE c.case_status = 'Processing' AND c.user_id = $1
      AND (d.is_deleted IS NULL OR d.is_deleted = false)`,
    [lawyerId]
  );
  return rows[0].count;
};

// count of pending task documents where the doc_status is not "approved", "done", or "completed"
export const countPendingTaskDocuments = async () => {
  const { rows } = await query(
    `SELECT COUNT(*) FROM document_tbl d 
     JOIN case_tbl c ON d.case_id = c.case_id
     WHERE doc_type = 'Task' AND LOWER(doc_status) NOT IN ('approved', 'done', 'completed')
     AND (c.case_status NOT IN ('Archived (Completed)', 'Archived (Dismissed)', 'Completed', 'Dismissed') OR c.case_status IS NULL)
     AND (d.is_deleted IS NULL OR d.is_deleted = false)`
  );
  return rows[0].count;
};

// count pending task documents assigned to a paralegal or staff (for staff/paralegal/lawyer dashboard)
export const countUserPendingTaskDocuments = async (userId) => {
  const sql = `
    SELECT COUNT(DISTINCT d.doc_id) AS count
    FROM document_tbl d
    LEFT JOIN case_tbl c ON d.case_id = c.case_id
    WHERE 
      d.doc_type = 'Task'
      AND (
        d.doc_tasked_to = $1         -- tasks assigned to the user
        OR d.doc_tasked_by = $1      -- tasks created by the user
        OR c.user_id = $1            -- tasks belonging to lawyer's cases
      )
      AND (d.doc_status IS NULL OR LOWER(d.doc_status) NOT IN ('approved', 'completed', 'done'))
      AND (c.case_status NOT IN ('Archived (Completed)', 'Archived (Dismissed)', 'Completed', 'Dismissed') OR c.case_status IS NULL)
      AND (d.is_deleted IS NULL OR d.is_deleted = false)
  `;

  const { rows } = await query(sql, [userId]);
  return Number(rows[0].count) || 0;
};

// Remove a specific reference path from doc_reference JSONB array
export const removeReferenceFromDocument = async (docId, referencePath) => {
  const sql = `
    UPDATE document_tbl
    SET doc_reference = COALESCE((
      SELECT jsonb_agg(value)
      FROM jsonb_array_elements(doc_reference)
      WHERE value::text <> to_jsonb($1::text)::text
    ), '[]'::jsonb)
    WHERE doc_id = $2
    RETURNING *;
  `;
  const { rows } = await query(sql, [referencePath, docId]);
  return rows[0];
};

// ------------------- ENCRYPTION FUNCTIONS FOR ARCHIVED CASES -------------------

// Encrypt all documents for a case when archiving
export const encryptDocumentFiles = async (caseId, userId) => {
  const results = {
    success: [],
    failed: [],
    totalCount: 0,
  };

  try {
    // Get all non-encrypted documents for this case
    const { rows: documents } = await query(
      `SELECT * FROM document_tbl 
       WHERE case_id = $1 
       AND (is_encrypted IS NULL OR is_encrypted = FALSE)
       AND (is_deleted IS NULL OR is_deleted = FALSE)
       AND doc_file IS NOT NULL`,
      [caseId]
    );

    results.totalCount = documents.length;

    if (documents.length === 0) {
      return results; // No documents to encrypt
    }

    for (const doc of documents) {
      try {
        // Encrypt main document file
        if (doc.doc_file) {
          const filePath = path.join(process.cwd(), doc.doc_file);

          if (!fs.existsSync(filePath)) {
            throw new Error(`File not found: ${doc.doc_file}`);
          }

          // Create backup of original
          const backupPath = filePath + ".original";
          fs.copyFileSync(filePath, backupPath);

          // Encrypt in-place (temp file then replace)
          const tempEncPath = filePath + ".tmp.enc";
          const metadata = await encryptFile({
            srcPath: filePath,
            destPath: tempEncPath,
          });

          // Replace original with encrypted
          fs.renameSync(tempEncPath, filePath);

          // Prepare encryption metadata
          const encryptionMeta = {
            ...metadata,
            originalPath: doc.doc_file,
            encryptedPath: doc.doc_file,
            encryptedAt: new Date().toISOString(),
            encryptedBy: userId,
            backupPath: doc.doc_file + ".original",
          };

          // Handle reference documents encryption
          let updatedReferences = doc.doc_reference;
          if (doc.doc_reference && Array.isArray(doc.doc_reference)) {
            updatedReferences = [];
            for (const refPath of doc.doc_reference) {
              const refString = typeof refPath === "string" ? refPath : refPath;
              const refFilePath = path.join(process.cwd(), refString);

              if (fs.existsSync(refFilePath)) {
                try {
                  // Backup reference file
                  const refBackup = refFilePath + ".original";
                  fs.copyFileSync(refFilePath, refBackup);

                  // Encrypt reference file
                  const refTempEnc = refFilePath + ".tmp.enc";
                  const refMeta = await encryptFile({
                    srcPath: refFilePath,
                    destPath: refTempEnc,
                  });

                  fs.renameSync(refTempEnc, refFilePath);

                  updatedReferences.push({
                    path: refString,
                    isEncrypted: true,
                    metadata: {
                      iv: refMeta.iv,
                      tag: refMeta.tag,
                      encKey: refMeta.encKey,
                      wrapIV: refMeta.wrapIV,
                      wrapTag: refMeta.wrapTag,
                      checksum: refMeta.checksum,
                    },
                  });
                } catch (refErr) {
                  console.error(
                    `Failed to encrypt reference ${refString}:`,
                    refErr
                  );
                  // Keep original path if encryption fails
                  updatedReferences.push(refString);
                }
              } else {
                // Keep original path if file doesn't exist
                updatedReferences.push(refString);
              }
            }
          }

          // Update database
          await query(
            `UPDATE document_tbl 
             SET is_encrypted = TRUE,
                 encryption_metadata = $1,
                 doc_reference = $2,
                 doc_last_updated_by = $3
             WHERE doc_id = $4`,
            [
              JSON.stringify(encryptionMeta),
              updatedReferences ? JSON.stringify(updatedReferences) : null,
              userId,
              doc.doc_id,
            ]
          );

          results.success.push(doc.doc_id);
        }
      } catch (err) {
        console.error(`Failed to encrypt document ${doc.doc_id}:`, err);
        results.failed.push({ docId: doc.doc_id, error: err.message });

        // Attempt rollback for this document
        try {
          const filePath = path.join(process.cwd(), doc.doc_file);
          const backupPath = filePath + ".original";
          if (fs.existsSync(backupPath)) {
            fs.copyFileSync(backupPath, filePath);
            fs.unlinkSync(backupPath);
          }
        } catch (rollbackErr) {
          console.error(`Rollback failed for doc ${doc.doc_id}:`, rollbackErr);
        }
      }
    }

    return results;
  } catch (err) {
    console.error("Error in encryptDocumentFiles:", err);
    throw err;
  }
};

// Decrypt all documents for a case when unarchiving
export const decryptDocumentFiles = async (caseId, userId) => {
  const results = {
    success: [],
    failed: [],
    totalCount: 0,
  };

  try {
    // Get all encrypted documents for this case
    const { rows: documents } = await query(
      `SELECT * FROM document_tbl 
       WHERE case_id = $1 
       AND is_encrypted = TRUE
       AND (is_deleted IS NULL OR is_deleted = FALSE)`,
      [caseId]
    );

    results.totalCount = documents.length;

    if (documents.length === 0) {
      return results; // No documents to decrypt
    }

    for (const doc of documents) {
      try {
        if (doc.doc_file && doc.encryption_metadata) {
          const filePath = path.join(process.cwd(), doc.doc_file);
          const metadata =
            typeof doc.encryption_metadata === "string"
              ? JSON.parse(doc.encryption_metadata)
              : doc.encryption_metadata;

          // Decrypt main file
          const tempDecPath = filePath + ".tmp.dec";
          const writable = fs.createWriteStream(tempDecPath);

          await decryptToStream({
            encryptedPath: filePath,
            metadata: metadata,
            writable: writable,
          });

          // Wait for stream to finish
          await new Promise((resolve, reject) => {
            writable.on("finish", resolve);
            writable.on("error", reject);
          });

          // Replace encrypted with decrypted
          fs.renameSync(tempDecPath, filePath);

          // Clean up backup if exists
          const backupPath = filePath + ".original";
          if (fs.existsSync(backupPath)) {
            fs.unlinkSync(backupPath);
          }

          // Handle reference documents decryption
          let updatedReferences = doc.doc_reference;
          if (doc.doc_reference && Array.isArray(doc.doc_reference)) {
            updatedReferences = [];
            for (const ref of doc.doc_reference) {
              if (typeof ref === "object" && ref.isEncrypted && ref.metadata) {
                const refFilePath = path.join(process.cwd(), ref.path);

                try {
                  const refTempDec = refFilePath + ".tmp.dec";
                  const refWritable = fs.createWriteStream(refTempDec);

                  await decryptToStream({
                    encryptedPath: refFilePath,
                    metadata: ref.metadata,
                    writable: refWritable,
                  });

                  // Wait for stream to finish
                  await new Promise((resolve, reject) => {
                    refWritable.on("finish", resolve);
                    refWritable.on("error", reject);
                  });

                  fs.renameSync(refTempDec, refFilePath);

                  // Clean up backup
                  const refBackup = refFilePath + ".original";
                  if (fs.existsSync(refBackup)) {
                    fs.unlinkSync(refBackup);
                  }

                  updatedReferences.push(ref.path);
                } catch (refErr) {
                  console.error(
                    `Failed to decrypt reference ${ref.path}:`,
                    refErr
                  );
                  // Keep original structure if decryption fails
                  updatedReferences.push(ref);
                }
              } else {
                // Keep non-encrypted references as-is
                updatedReferences.push(typeof ref === "object" ? ref.path : ref);
              }
            }
          }

          // Update database
          await query(
            `UPDATE document_tbl 
             SET is_encrypted = FALSE,
                 encryption_metadata = NULL,
                 doc_reference = $1,
                 doc_last_updated_by = $2
             WHERE doc_id = $3`,
            [
              updatedReferences ? JSON.stringify(updatedReferences) : null,
              userId,
              doc.doc_id,
            ]
          );

          results.success.push(doc.doc_id);
        }
      } catch (err) {
        console.error(`Failed to decrypt document ${doc.doc_id}:`, err);
        results.failed.push({ docId: doc.doc_id, error: err.message });
      }
    }

    return results;
  } catch (err) {
    console.error("Error in decryptDocumentFiles:", err);
    throw err;
  }
};

