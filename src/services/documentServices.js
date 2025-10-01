// ------------------- SERVICES or QUERIES FOR DOCUMENTS

import { query } from "../db.js";
import cache from "../utils/cache.js";

import bcrypt from "bcrypt";
const saltRounds = 10;

// Get all documents
export const getDocuments = async () => {
  return cache.wrap(
    "documents",
    "all",
    async () => {
      const { rows } = await query(
        "SELECT * FROM document_tbl ORDER BY doc_id DeSC"
      );
      return rows;
    },
    60 * 1000
  );
};

// Get a single document by ID
export const getDocumentById = async (docId) => {
  return cache.wrap(
    "document",
    String(docId),
    async () => {
      const { rows } = await query(
        "SELECT * FROM document_tbl WHERE doc_id = $1",
        [docId]
      );
      return rows[0];
    },
    5 * 60 * 1000
  );
};

// Get documents by Case ID
export const getDocumentsByCaseId = async (caseId) => {
  return cache.wrap(
    "documents_by_case",
    String(caseId),
    async () => {
      const { rows } = await query(
        "SELECT * FROM document_tbl WHERE case_id = $1 ORDER BY doc_id ASC",
        [caseId]
      );
      return rows;
    },
    60 * 1000
  );
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
  // Invalidate documents caches
  cache.del("documents", "all");
  if (case_id) cache.del("documents_by_case", String(case_id));
  return rows[0];
};

// Delete a document
export const deleteDocument = async (docId) => {
  const { rows } = await query(
    "DELETE FROM document_tbl WHERE doc_id = $1 RETURNING *",
    [docId]
  );
  cache.del("documents", "all");
  if (rows[0]?.case_id) cache.del("documents_by_case", String(rows[0].case_id));
  cache.del("document", String(docId));
  return rows[0];
};

// Simple search by name / tag / status
export const searchDocuments = async (term) => {
  const like = `%${term}%`;
  const key = (term || "").trim().toLowerCase();
  return cache.wrap(
    "document_search",
    key,
    async () => {
      const { rows } = await query(
        `SELECT * FROM document_tbl
     WHERE doc_name ILIKE $1 OR COALESCE(doc_tag,'') ILIKE $1 OR COALESCE(doc_status,'') ILIKE $1
     ORDER BY doc_id DESC`,
        [like]
      );
      return rows;
    },
    30 * 1000
  );
};
