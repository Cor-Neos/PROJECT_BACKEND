// ----------------  SERVICES or QUERIES for the Branches of the BOS Law Firm

import { query } from "../db.js";
import cache from "../utils/cache.js";

// Fetching All Users from the user_tbl
export const getBranches = async () => {
  return cache.wrap(
    "branches",
    "all",
    async () => {
      const { rows } = await query(
        "SELECT * FROM branch_tbl ORDER BY branch_id ASC"
      );
      return rows;
    },
    5 * 60 * 1000 // 5 minutes
  );
};
