// ----------------  SERVICES or QUERIES

import { query } from "../db.js";
import cache from "../utils/cache.js";

// client_password removed from usage

// Fetching clients (The only ones that are not Removed)
export const getClients = async () => {
  return cache.wrap(
    "clients",
    "active_inactive",
    async () => {
      const { rows } = await query(
        "SELECT * FROM client_tbl WHERE client_status = 'Active' or client_status = 'Inactive' ORDER BY client_id ASC"
      );
      return rows;
    },
    60 * 1000 // 1 minute
  );
};

// Fetching ALL Clients (with those Removed)
export const getAllClients = async () => {
  return cache.wrap(
    "clients",
    "all",
    async () => {
      const { rows } = await query(
        "SELECT * FROM client_tbl ORDER BY client_id ASC"
      );
      return rows;
    },
    60 * 1000
  );
};

// Fetching all clients of a certain lawyer
export const getClientsByLawyerId = async (userId) => {
  return cache.wrap(
    "clients_by_lawyer",
    String(userId),
    async () => {
      const { rows } = await query(
        `SELECT * FROM client_tbl WHERE created_by = $1 AND client_status != 'Removed'`,
        [userId]
      );
      return rows;
    },
    60 * 1000
  );
};

// Adding a new client
export const createClient = async (clientData) => {
  const {
    client_fullname,
    client_address,
    client_email,
    client_phonenum,
    created_by,
    client_status = "Active",
  } = clientData;

  const { rows } = await query(
    "INSERT INTO client_tbl (client_fullname, client_address, client_email, client_phonenum, created_by, client_status) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *",
    [
      client_fullname,
      client_address,
      client_email,
      client_phonenum,
      created_by,
      client_status,
    ]
  );
  // Invalidate client-related caches
  cache.del("clients", "active_inactive");
  cache.del("clients", "all");
  if (clientData.created_by) cache.del("clients_by_lawyer", String(clientData.created_by));
  return rows[0];
};

// Updating an existing client
export const updateClient = async (clientId, clientData) => {
  const {
    client_fullname,
    client_address,
    client_email,
    client_phonenum,
    client_status,
    client_last_updated_by,
  } = clientData;

  const { rows } = await query(
    "UPDATE client_tbl SET client_fullname = $1, client_address = $2, client_email = $3, client_phonenum = $4, client_status = $5, client_last_updated_by = $6 WHERE client_id = $7 RETURNING *",
    [
      client_fullname,
      client_address,
      client_email,
      client_phonenum,
      client_status,
      client_last_updated_by,
      clientId,
    ]
  );
  // Invalidate caches broadly as client could change filters/ownership
  cache.del("clients", "active_inactive");
  cache.del("clients", "all");
  if (clientData.client_last_updated_by)
    cache.del("clients_by_lawyer", String(clientData.client_last_updated_by));
  return rows[0];
};

// Deleting a client by ID
export const deleteClientById = async (clientId) => {
  const { rows } = await query(
    "DELETE FROM client_tbl WHERE client_id = $1 RETURNING *",
    [clientId]
  );
  // Invalidate caches
  cache.del("clients", "active_inactive");
  cache.del("clients", "all");
  if (rows[0]?.created_by)
    cache.del("clients_by_lawyer", String(rows[0].created_by));
  return rows[0];
};

// Searching for a client
export const searchClients = async (searchTerm) => {
  // Do not cache arbitrary search by default; optional short TTL cache by normalized term
  const key = (searchTerm || "").trim().toLowerCase();
  return cache.wrap(
    "client_search",
    key,
    async () => {
      const { rows } = await query(
        "SELECT * FROM client_tbl WHERE client_fullname ILIKE $1 OR client_email ILIKE $1 OR client_phonenum ILIKE $1 OR client_address ILIKE $1",
        [`%${searchTerm}%`]
      );
      return rows;
    },
    30 * 1000 // 30s to help bursty searches
  );
};

// ---------------- SERVICES OR QUERIES FOR CLIENT CONTACTS

// Fetching all client contacts
export const getClientContacts = async () => {
  return cache.wrap(
    "client_contacts",
    "all",
    async () => {
      const { rows } = await query(
        `SELECT * FROM client_contact_tbl, client_tbl
    WHERE client_contact_tbl.client_id = client_tbl.client_id AND client_tbl.client_status != 'Removed' AND client_contact_tbl.contact_status != 'Removed'`
      );
      return rows;
    },
    60 * 1000
  );
};

// Fetching a lawyer's clients' contacts
export const getLawyersClientContacts = async (lawyerUserId) => {
  return cache.wrap(
    "client_contacts_by_lawyer",
    String(lawyerUserId),
    async () => {
      const { rows } = await query(
        `
    SELECT *
    FROM client_contact_tbl AS cc
    JOIN client_tbl AS c 
        ON cc.client_id = c.client_id
    JOIN user_tbl AS u
        ON c.created_by = u.user_id
    WHERE u.user_id = $1 AND c.client_status != 'Removed'
    `,
        [lawyerUserId]
      );
      return rows;
    },
    60 * 1000
  );
};

// Adding a new client contact
export const createClientContact = async (contactData) => {
  const {
    contact_fullname,
    contact_address,
    contact_email,
    contact_phone,
    contact_role,
    client_id,
    contact_created_by,
  } = contactData;
  const { rows } = await query(
    "INSERT INTO client_contact_tbl (contact_fullname, contact_address, contact_email, contact_phone, contact_role, client_id, contact_created_by, contact_status) VALUES ($1, $2, $3, $4, $5, $6, $7, 'Active') RETURNING *",
    [
      contact_fullname,
      contact_address,
      contact_email,
      contact_phone,
      contact_role,
      client_id,
      contact_created_by,
    ]
  );
  cache.del("client_contacts", "all");
  if (contactData.contact_created_by)
    cache.del("client_contacts_by_lawyer", String(contactData.contact_created_by));
  return rows[0];
};

// Updating an existing client contact
export const updateClientContact = async (contact_id, contactData) => {
  const {
    contact_fullname,
    contact_address,
    contact_email,
    contact_phone,
    contact_role,
    client_id,
    contact_updated_by,
    contact_status,
  } = contactData;
  const { rows } = await query(
    "UPDATE client_contact_tbl SET contact_fullname = $1, contact_address = $2, contact_email = $3, contact_phone = $4, contact_role = $5, client_id = $6, contact_updated_by = $7, contact_status = $8 WHERE contact_id = $9 RETURNING *",
    [
      contact_fullname,
      contact_address,
      contact_email,
      contact_phone,
      contact_role,
      client_id,
      contact_updated_by,
      contact_status,
      contact_id,
    ]
  );
  cache.del("client_contacts", "all");
  if (contactData.contact_updated_by)
    cache.del("client_contacts_by_lawyer", String(contactData.contact_updated_by));
  return rows[0];
};

// Deleting a client contact by ID
export const deleteClientContactById = async (contact_id) => {
  const { rows } = await query(
    "DELETE FROM client_contact_tbl WHERE contact_id = $1 RETURNING *",
    [contact_id]
  );
  cache.del("client_contacts", "all");
  // we don't know owner by user id here; clear by prefix to be safe
  cache.delByPrefix("client_contacts_by_lawyer:");
  return rows[0];
};

// searching for client contacts
export const searchClientContacts = async (searchTerm) => {
  const key = (searchTerm || "").trim().toLowerCase();
  return cache.wrap(
    "client_contacts_search",
    key,
    async () => {
      const { rows } = await query(
        "SELECT * FROM client_contact_tbl WHERE contact_fullname ILIKE $1 OR contact_email ILIKE $1 OR contact_phone ILIKE $1 OR contact_address ILIKE $1",
        [`%${searchTerm}%`]
      );
      return rows;
    },
    30 * 1000
  );
};
