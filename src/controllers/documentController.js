import * as documentService from "../services/documentServices.js";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import path from "path";
import fs from "fs";

const UPLOADS_DIR = "C:/Users/Noel Batoctoy/caps/uploads";

const isAdmin = (user) => user?.user_role === "Admin";
const getOwnerId = (doc) => doc?.doc_tasked_by ?? doc?.doc_submitted_by ?? null;
const getAuthToken = (req) => {
  const h = req.headers["authorization"] || "";
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1] : null;
};

const verifyDocToken = (token, expected) => {
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (
      payload?.scope === "doc_access" &&
      payload?.doc_id?.toString() === expected.doc_id?.toString() &&
      payload?.user_id?.toString() === expected.user_id?.toString()
    ) {
      return true;
    }
  } catch (_) {}
  return false;
};

// Helper: stream a file safely
const streamFile = (absPath, res) => {
  if (!fs.existsSync(absPath)) return res.status(404).json({ error: "File not found" });
  return res.sendFile(absPath);
};

// Fetching All Documents
export const getDocuments = async (req, res) => {
  try {
    const documents = await documentService.getDocuments();
    const mapped = documents.map((d) => {
      const doc = { ...d };
      if (doc.doc_password) delete doc.doc_password;
      const ownerId = getOwnerId(doc);
      const isOwner = req.user?.user_id?.toString() === ownerId?.toString();
      const needsPassword = !!d.doc_password && !(isAdmin(req.user) || isOwner);
      return { ...doc, requires_password_for_current_user: needsPassword };
    });
    res.status(200).json(mapped);
  } catch (err) {
    console.error("Error fetching documents", err);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// Fetching All Documents of Lawyer's Cases
export const getDocumentsByLawyer = async (req, res) => {
  const lawyerId = req.user.user_id;
  try {
    const documents = await documentService.getDocumentsByLawyer(lawyerId);
    res.status(200).json(documents);
  } catch (err) {
    console.error("Error fetching documents for lawyer", err);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// Fetching a Single Document by ID
export const getDocumentById = async (req, res) => {
  const { id } = req.params;
  try {
    const document = await documentService.getDocumentById(id);
    if (!document) {
      return res.status(404).json({ message: "Document not found" });
    }
    // Don't expose password; add a hint if current user would need it
    if (document.doc_password) delete document.doc_password;
    const ownerId = getOwnerId(document);
    const needsPassword = !!document.doc_password && !isAdmin(req.user) && req.user?.user_id?.toString() !== ownerId?.toString();
    res.status(200).json({ ...document, requires_password_for_current_user: needsPassword });
  } catch (err) {
    console.error("Error fetching document by ID", err);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// Fetch documents by Case ID
export const getDocumentsByCaseId = async (req, res) => {
  const { caseId } = req.params;
  try {
    const documents = await documentService.getDocumentsByCaseId(caseId);
    const mapped = documents.map((d) => {
      const doc = { ...d };
      if (doc.doc_password) delete doc.doc_password;
      const ownerId = getOwnerId(doc);
      const isOwner = req.user?.user_id?.toString() === ownerId?.toString();
      const needsPassword = !!d.doc_password && !(isAdmin(req.user) || isOwner);
      return { ...doc, requires_password_for_current_user: needsPassword };
    });
    res.status(200).json(mapped);
  } catch (err) {
    console.error("Error fetching documents by Case ID", err);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// Get documents submitted by a specific user
export const getDocumentsBySubmitter = async (req, res) => {
  const { userId } = req.params;
  try {
    const documents = await documentService.getDocumentsBySubmitter(userId);
    res.status(200).json(documents);
  } catch (err) {
    console.error("Error fetching documents by Submitter ID", err);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// Fetch all task documents assigned to a specific user
export const getTaskDocumentsByUser = async (req, res) => {
  const { userId } = req.params;
  try {
    const documents = await documentService.getTaskDocumentsByUser(userId);
    res.status(200).json(documents);
  } catch (err) {
    console.error("Error fetching task documents by User ID", err);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// Creating a New Document
export const createDocument = async (req, res) => {
  try {
    const mainFile = req.files["doc_file"]
      ? req.files["doc_file"][0].filename
      : null;
    const references = req.files["doc_reference"]
      ? req.files["doc_reference"].map((f) => f.filename)
      : [];

    // Save to DB
    const docData = {
      ...req.body,
      doc_file: mainFile
        ? `/uploads/${
            req.body.doc_type === "Tasked" ? "taskedDocs" : "supportingDocs"
          }/${mainFile}`
        : null,
      doc_reference: references.length
        ? JSON.stringify(references.map((f) => `/uploads/referenceDocs/${f}`))
        : null,
    };

    const newDoc = await documentService.createDocument(docData);

    res.status(201).json(newDoc);
  } catch (err) {
    console.error("Error creating document:", err);
    res.status(500).json({ error: "Failed to create document" });
  }
};

// Verify a document's password and issue a short-lived access token
export const verifyDocumentPassword = async (req, res) => {
  try {
    const { id } = req.params;
    const { password } = req.body || {};
    const doc = await documentService.getDocumentById(id);
    if (!doc) return res.status(404).json({ error: "Document not found" });

    const ownerId = getOwnerId(doc);
    if (isAdmin(req.user) || req.user?.user_id?.toString() === ownerId?.toString()) {
      // Owner/admin doesn't need password; still issue token for convenience
      const token = jwt.sign(
        { scope: "doc_access", doc_id: doc.doc_id, user_id: req.user.user_id },
        process.env.JWT_SECRET,
        { expiresIn: "30m" }
      );
      return res.json({ token, expiresIn: 1800 });
    }

    if (!doc.doc_password) return res.status(400).json({ error: "Document is not password-protected" });
    const ok = await bcrypt.compare(String(password || ""), doc.doc_password);
    if (!ok) return res.status(401).json({ error: "Invalid password" });

    const token = jwt.sign(
      { scope: "doc_access", doc_id: doc.doc_id, user_id: req.user.user_id },
      process.env.JWT_SECRET,
      { expiresIn: "30m" }
    );
    res.json({ token, expiresIn: 1800 });
  } catch (err) {
    console.error("Error verifying document password:", err);
    res.status(500).json({ error: "Failed to verify password" });
  }
};

// Download by document ID with access enforcement
export const downloadDocumentById = async (req, res) => {
  try {
    const { id } = req.params;
    const doc = await documentService.getDocumentById(id);
    if (!doc) return res.status(404).json({ error: "Document not found" });

    const ownerId = getOwnerId(doc);
    const isOwner = req.user?.user_id?.toString() === ownerId?.toString();
    const needsPassword = !!doc.doc_password && !isAdmin(req.user) && !isOwner;
    if (needsPassword) {
      const token = getAuthToken(req);
      if (!token || !verifyDocToken(token, { doc_id: doc.doc_id, user_id: req.user.user_id })) {
        return res.status(401).json({ error: "Password required" });
      }
    }

    // Resolve absolute path from stored doc_file
    const relPath = doc.doc_file?.startsWith("/") ? doc.doc_file.slice(1) : doc.doc_file; // drop leading '/'
    const absPath = path.join(UPLOADS_DIR, relPath?.replace(/^uploads\/?/, ""));
    return streamFile(absPath, res);
  } catch (err) {
    console.error("Error downloading document:", err);
    res.status(500).json({ error: "Failed to download document" });
  }
};

// Download by filename under uploads, enforcing access. Supports both taskedDocs and supportingDocs.
export const downloadDocumentByFilename = async (req, res) => {
  try {
    const { subdir, filename } = req.params; // subdir in ["taskedDocs","supportingDocs"]
    const rel = `/uploads/${subdir}/${filename}`;
    const doc = await documentService.getDocumentByFilePath(rel);
    if (!doc) return res.status(404).json({ error: "Document not found" });

    const ownerId = getOwnerId(doc);
    const isOwner = req.user?.user_id?.toString() === ownerId?.toString();
    const needsPassword = !!doc.doc_password && !isAdmin(req.user) && !isOwner;
    if (needsPassword) {
      const token = getAuthToken(req);
      if (!token || !verifyDocToken(token, { doc_id: doc.doc_id, user_id: req.user.user_id })) {
        return res.status(401).json({ error: "Password required" });
      }
    }

    const absPath = path.join(UPLOADS_DIR, subdir, filename);
    return streamFile(absPath, res);
  } catch (err) {
    console.error("Error downloading document by filename:", err);
    res.status(500).json({ error: "Failed to download document" });
  }
};

// Verify a document's password and issue a short-lived access token
export const verifyDocumentPassword = async (req, res) => {
  try {
    const { id } = req.params;
    const { password } = req.body || {};
    const doc = await documentService.getDocumentById(id);
    if (!doc) return res.status(404).json({ error: "Document not found" });

    const ownerId = getOwnerId(doc);
    if (isAdmin(req.user) || req.user?.user_id?.toString() === ownerId?.toString()) {
      // Owner/admin doesn't need password; still issue token for convenience
      const token = jwt.sign(
        { scope: "doc_access", doc_id: doc.doc_id, user_id: req.user.user_id },
        process.env.JWT_SECRET,
        { expiresIn: "30m" }
      );
      return res.json({ token, expiresIn: 1800 });
    }

    if (!doc.doc_password) return res.status(400).json({ error: "Document is not password-protected" });
    const ok = await bcrypt.compare(String(password || ""), doc.doc_password);
    if (!ok) return res.status(401).json({ error: "Invalid password" });

    const token = jwt.sign(
      { scope: "doc_access", doc_id: doc.doc_id, user_id: req.user.user_id },
      process.env.JWT_SECRET,
      { expiresIn: "30m" }
    );
    res.json({ token, expiresIn: 1800 });
  } catch (err) {
    console.error("Error verifying document password:", err);
    res.status(500).json({ error: "Failed to verify password" });
  }
};

// Download by document ID with access enforcement
export const downloadDocumentById = async (req, res) => {
  try {
    const { id } = req.params;
    const doc = await documentService.getDocumentById(id);
    if (!doc) return res.status(404).json({ error: "Document not found" });

    const ownerId = getOwnerId(doc);
    const isOwner = req.user?.user_id?.toString() === ownerId?.toString();
    const needsPassword = !!doc.doc_password && !isAdmin(req.user) && !isOwner;
    if (needsPassword) {
      const token = getAuthToken(req);
      if (!token || !verifyDocToken(token, { doc_id: doc.doc_id, user_id: req.user.user_id })) {
        return res.status(401).json({ error: "Password required" });
      }
    }

    // Resolve absolute path from stored doc_file
    const relPath = doc.doc_file?.startsWith("/") ? doc.doc_file.slice(1) : doc.doc_file; // drop leading '/'
    const absPath = path.join(UPLOADS_DIR, relPath?.replace(/^uploads\/?/, ""));
    return streamFile(absPath, res);
  } catch (err) {
    console.error("Error downloading document:", err);
    res.status(500).json({ error: "Failed to download document" });
  }
};

// Download by filename under uploads, enforcing access. Supports both taskedDocs and supportingDocs.
export const downloadDocumentByFilename = async (req, res) => {
  try {
    const { subdir, filename } = req.params; // subdir in ["taskedDocs","supportingDocs"]
    const rel = `/uploads/${subdir}/${filename}`;
    const doc = await documentService.getDocumentByFilePath(rel);
    if (!doc) return res.status(404).json({ error: "Document not found" });

    const ownerId = getOwnerId(doc);
    const isOwner = req.user?.user_id?.toString() === ownerId?.toString();
    const needsPassword = !!doc.doc_password && !isAdmin(req.user) && !isOwner;
    if (needsPassword) {
      const token = getAuthToken(req);
      if (!token || !verifyDocToken(token, { doc_id: doc.doc_id, user_id: req.user.user_id })) {
        return res.status(401).json({ error: "Password required" });
      }
    }

    const absPath = path.join(UPLOADS_DIR, subdir, filename);
    return streamFile(absPath, res);
  } catch (err) {
    console.error("Error downloading document by filename:", err);
    res.status(500).json({ error: "Failed to download document" });
  }
};

// Updating an Existing Document
export const updateDocument = async (req, res) => {
  const { id } = req.params;
  try {
    const body = { ...req.body };

    const files = req.files || {}; // safely handle undefined

    const mainFile = files["doc_file"]?.[0]?.filename || null;
    const references = files["doc_reference"]?.map((f) => f.filename) || [];

    if (mainFile) {
      body.doc_file = `/uploads/${
        req.body.doc_type === "Task" ? "taskedDocs" : "supportingDocs"
      }/${mainFile}`;
    }

    if (files["doc_reference"] || req.body.doc_reference) {
      let existing = [];

      const rawRef = req.body.doc_reference;

      if (Array.isArray(rawRef)) {
        for (const ref of rawRef) {
          if (typeof ref === "string" && ref.trim().startsWith("[")) {
            try {
              const parsed = JSON.parse(ref);
              if (Array.isArray(parsed)) existing.push(...parsed);
            } catch (e) {
              console.warn("Invalid JSON string in doc_reference array:", ref);
            }
          } else if (typeof ref === "string" && ref.trim() !== "") {
            existing.push(ref);
          }
        }
      } else if (typeof rawRef === "string" && rawRef.trim()) {
        try {
          const parsed = JSON.parse(rawRef);
          existing = Array.isArray(parsed) ? parsed : [rawRef];
        } catch {
          existing = [rawRef];
        }
      }

      // Add new uploaded references
      const newRefs = (files["doc_reference"] || []).map(
        (f) => `/uploads/referenceDocs/${f.filename}`
      );

      // Merge and deduplicate
      const allRefs = [...new Set([...existing, ...newRefs])];

      // Final JSON string to send to service
      body.doc_reference = allRefs.length ? JSON.stringify(allRefs) : null;
    }

    const updatedDoc = await documentService.updateDocument(id, body);

    if (!updatedDoc) {
      return res.status(404).json({ message: "Document not found" });
    }

    res.status(200).json(updatedDoc);
  } catch (err) {
    console.error("Error updating document:", err);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// Deleting a Document
export const deleteDocument = async (req, res) => {
  const { id } = req.params;
  try {
    const deleted = await documentService.deleteDocument(id);
    if (!deleted) {
      return res.status(404).json({ message: "Document not found" });
    }
    res.status(200).json({ message: "Document deleted successfully" });
  } catch (err) {
    console.error("Error deleting document:", err);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// Searching Documents
export const searchDocuments = async (req, res) => {
  const { query } = req.query;
  try {
    const results = await documentService.searchDocuments(query);
    res.status(200).json(results);
  } catch (err) {
    console.error("Error searching documents:", err);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// Count documents with status "done" for dashboard
export const countForApprovalDocuments = async (req, res) => {
  try {
    const count = await documentService.countForApprovalDocuments();
    res.status(200).json({ count });
  } catch (err) {
    console.error("Error counting documents for approval:", err);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// Count documents with status "processing" for dashboard
export const countProcessingDocuments = async (req, res) => {
  try {
    const count = await documentService.countProcessingDocuments();
    res.status(200).json({ count });
  } catch (err) {
    console.error("Error counting processing documents:", err);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// Count processing documents of a specific lawyer
export const countProcessingDocumentsByLawyer = async (req, res) => {
  const lawyerId = req.user.user_id;
  try {
    const count = await documentService.countProcessingDocumentsByLawyer(
      lawyerId
    );
    res.status(200).json({ count });
  } catch (err) {
    console.error("Error counting processing documents for lawyer:", err);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// count of pending task documents where the doc_status is "todo"
export const countPendingTaskDocuments = async (req, res) => {
  try {
    const count = await documentService.countPendingTaskDocuments();
    res.status(200).json({ count });
  } catch (err) {
    console.error("Error counting pending task documents:", err);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// count pending task documents assigned to a paralegal or staff
export const countUserPendingTaskDocuments = async (req, res) => {
  const userId = req.params.userId;
  try {
    const count = await documentService.countUserPendingTaskDocuments(userId);
    res.status(200).json({ count });
  } catch (err) {
    console.error("Error counting user pending task documents:", err);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// remove a document reference from a document

export const removeReference = async (req, res) => {
  try {
    const { id } = req.params;
    const { referencePath } = req.body;

    if (!referencePath) {
      return res.status(400).json({ error: "doc_reference path is required" });
    }

    const updatedDoc = await documentService.removeReferenceFromDocument(
      id,
      referencePath
    );
    if (!updatedDoc) {
      return res.status(404).json({ error: "Document not found" });
    }

    res.json(updatedDoc);
  } catch (err) {
    console.error("Error removing reference:", err);
    res.status(500).json({ error: "Failed to remove reference" });
  }
};
