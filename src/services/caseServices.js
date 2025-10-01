// ----------------  SERVICES or QUERIES for the Cases of the BOS Law Firm ... ---------------- //

import { query } from "../db.js";
import cache from "../utils/cache.js";

// Fetching All Cases from the case_tbl
export const getCases = async () => {
  const queryStr = `
    SELECT *
    FROM case_tbl c
    LEFT JOIN user_tbl u ON c.user_id = u.user_id
    LEFT JOIN client_tbl cl ON c.client_id = cl.client_id
    LEFT JOIN case_category_tbl cc ON c.cc_id = cc.cc_id
    LEFT JOIN cc_type_tbl ct ON c.ct_id = ct.ct_id
    LEFT JOIN branch_tbl b ON u.branch_id = b.branch_id
    ORDER BY c.case_date_created DESC;
  `;
  return cache.wrap(
    "cases",
    "all",
    async () => {
      const { rows } = await query(queryStr);
      return rows;
    },
    60 * 1000
  );
};

// Fetching a Single Case by ID
export const getCaseById = async (caseId) => {
  const queryStr = `
    SELECT *
    FROM case_tbl c
    LEFT JOIN user_tbl u ON c.user_id = u.user_id
    LEFT JOIN client_tbl cl ON c.client_id = cl.client_id
    LEFT JOIN case_category_tbl cc ON c.cc_id = cc.cc_id
    LEFT JOIN cc_type_tbl ct ON c.ct_id = ct.ct_id
    WHERE c.case_id = $1
    ORDER BY c.case_date_created DESC;
  `;
  return cache.wrap(
    "case",
    String(caseId),
    async () => {
      const { rows } = await query(queryStr, [caseId]);
      return rows[0];
    },
    5 * 60 * 1000
  );
};

// Fetching Cases by User ID (A Certain Lawyer's Cases)
export const getCasesByUserId = async (userId) => {
  const queryStr = `
    SELECT *
    FROM case_tbl c
    LEFT JOIN user_tbl u ON c.user_id = u.user_id
    LEFT JOIN client_tbl cl ON c.client_id = cl.client_id
    LEFT JOIN case_category_tbl cc ON c.cc_id = cc.cc_id
    LEFT JOIN cc_type_tbl ct ON c.ct_id = ct.ct_id
    LEFT JOIN branch_tbl b ON u.branch_id = b.branch_id
    WHERE c.user_id = $1 OR c.user_id IS NULL
    ORDER BY c.case_date_created DESC;
  `;
  return cache.wrap(
    "cases_by_user",
    String(userId),
    async () => {
      const { rows } = await query(queryStr, [userId]);
      return rows;
    },
    60 * 1000
  );
};

// counting all processing cases
export const countProcessingCases = async () => {
  return cache.wrap(
    "cases_count",
    "processing",
    async () => {
      const { rows } = await query(
        `SELECT COUNT(*) FROM case_tbl WHERE case_status = 'Processing'`
      );
      return rows[0].count;
    },
    30 * 1000
  );
};

// Creating a New Case
export const createCase = async (caseData) => {
  const {
    case_status,
    case_fee,
    case_remarks,
    case_cabinet,
    case_drawer,
    user_id,
    client_id,
    cc_id,
    ct_id,
    assigned_by,
  } = caseData;

  const queryStr = `
    INSERT INTO case_tbl (case_status, case_fee, case_balance, case_remarks, case_cabinet, case_drawer, user_id, client_id, cc_id, ct_id, assigned_by)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    RETURNING *;
  `;

  const { rows } = await query(queryStr, [
    case_status,
    case_fee,
    case_fee, // case_balance is the same as case_fee initially
    case_remarks,
    case_cabinet,
    case_drawer,
    user_id,
    client_id,
    cc_id,
    ct_id,
    assigned_by,
  ]);

  // Invalidate caches related to cases
  cache.del("cases", "all");
  cache.delByPrefix("cases_by_user:");
  cache.del("cases_count", "processing");
  return rows[0];
};

// Updating an Existing Case
export const updateCase = async (caseId, caseData) => {
  const {
    case_status,
    case_fee,
    case_balance,
    case_remarks,
    case_cabinet,
    case_drawer,
    user_id,
    client_id,
    cc_id,
    ct_id,
    last_updated_by,
    case_verdict,
  } = caseData;

  const queryStr = `
    UPDATE case_tbl
    SET case_last_updated = NOW(), case_status = $1, case_fee = $2, case_balance = $3, case_remarks = $4, case_cabinet = $5, case_drawer = $6, user_id = $7, client_id = $8, cc_id = $9, ct_id = $10, last_updated_by = $11, case_verdict = $12
    WHERE case_id = $13
    RETURNING *;
  `;

  const { rows } = await query(queryStr, [
    case_status,
    case_fee,
    case_balance,
    case_remarks,
    case_cabinet,
    case_drawer,
    user_id,
    client_id,
    cc_id,
    ct_id,
    last_updated_by,
    case_verdict,
    caseId,
  ]);

  // Invalidate caches for this case and aggregates
  cache.del("case", String(caseId));
  cache.del("cases", "all");
  cache.delByPrefix("cases_by_user:");
  cache.del("cases_count", "processing");
  return rows[0]; 
};

// Deleting a Case
export const deleteCase = async (caseId) => {
  const queryStr = `
    DELETE FROM case_tbl
    WHERE case_id = $1
    RETURNING *;
  `;

  const { rows } = await query(queryStr, [caseId]);

  if (rows.length === 0) {
    throw new Error("Case not found");
  }

  // Invalidate caches
  cache.del("case", String(caseId));
  cache.del("cases", "all");
  cache.delByPrefix("cases_by_user:");
  cache.del("cases_count", "processing");
  return rows[0];
};

// Search Cases
export const searchCases = async (searchTerm) => {
  const queryStr = `
    SELECT *
    FROM case_tbl c
    LEFT JOIN user_tbl u ON c.user_id = u.user_id
    LEFT JOIN client_tbl cl ON c.client_id = cl.client_id
    LEFT JOIN case_category_tbl cc ON c.cc_id = cc.cc_id
    LEFT JOIN cc_type_tbl ct ON c.ct_id = ct.ct_id
    WHERE ct.ct_name ILIKE $1 OR cl.client_fullname ILIKE $1
      OR c.case_status ILIKE $1 OR u.user_fname ILIKE $1 
      OR u.user_mname ILIKE $1 OR u.user_lname ILIKE $1
    ORDER BY c.case_id;
  `;
  const key = (searchTerm || "").trim().toLowerCase();
  return cache.wrap(
    "case_search",
    key,
    async () => {
      const { rows } = await query(queryStr, [`%${searchTerm}%`]);
      return rows;
    },
    30 * 1000
  );
};

// Case Categories and Types Services

export const getCaseCategories = async () => {
  const queryStr = `
    SELECT * FROM case_category_tbl ORDER BY cc_id;
  `;
  return cache.wrap(
    "case_categories",
    "all",
    async () => {
      const { rows } = await query(queryStr);
      return rows;
    },
    24 * 60 * 60 * 1000 // 1 day
  );
};

export const getCaseCategoryTypes = async () => {
  const queryStr = `
    SELECT * FROM cc_type_tbl ORDER BY ct_id;
  `;
  return cache.wrap(
    "case_category_types",
    "all",
    async () => {
      const { rows } = await query(queryStr);
      return rows;
    },
    24 * 60 * 60 * 1000
  );
};

// other services

export const getAdmins = async () => {
  const queryStr = `
    SELECT * FROM user_tbl WHERE user_role = 'Admin' ORDER BY user_id;
  `;
  return cache.wrap(
    "admins",
    "all",
    async () => {
      const { rows } = await query(queryStr);
      return rows;
    },
    5 * 60 * 1000
  );
};

export const getUserById = async (userId) => {
  const queryStr = `
    SELECT * FROM user_tbl WHERE user_id = $1;
  `;
  return cache.wrap(
    "user",
    String(userId),
    async () => {
      const { rows } = await query(queryStr, [userId]);
      return rows[0];
    },
    10 * 60 * 1000
  );
};

export const getClientEmailById = async (clientId) => {
  const queryStr = `
    SELECT client_email FROM client_tbl WHERE client_id = $1;
  `;
  return cache.wrap(
    "client_email",
    String(clientId),
    async () => {
      const { rows } = await query(queryStr, [clientId]);
      return rows[0] ? rows[0].client_email : null;
    },
    10 * 60 * 1000
  );
};

export const getClientNameById = async (clientId) => {
  const queryStr = `
    SELECT client_fullname FROM client_tbl WHERE client_id = $1;
  `;
  return cache.wrap(
    "client_name",
    String(clientId),
    async () => {
      const { rows } = await query(queryStr, [clientId]);
      return rows[0] ? rows[0].client_fullname : null;
    },
    10 * 60 * 1000
  );
};

export const getCaseCategoryNameById = async (ccId) => {
  const queryStr = `
    SELECT cc_name FROM case_category_tbl WHERE cc_id = $1;
  `;
  return cache.wrap(
    "case_category_name",
    String(ccId),
    async () => {
      const { rows } = await query(queryStr, [ccId]);
      return rows[0] ? rows[0].cc_name : null;
    },
    24 * 60 * 60 * 1000
  );
};

export const getCaseTypeNameById = async (ctId) => {
  const queryStr = `
    SELECT ct_name FROM cc_type_tbl WHERE ct_id = $1;
  `;
  return cache.wrap(
    "case_type_name",
    String(ctId),
    async () => {
      const { rows } = await query(queryStr, [ctId]);
      return rows[0] ? rows[0].ct_name : null;
    },
    24 * 60 * 60 * 1000
  );
};
