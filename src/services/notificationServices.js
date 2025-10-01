// ----------------  SERVICES or QUERIES for the Notification of the BOS Law Firm

import { query } from "../db.js";
import cache from "../utils/cache.js";

// Fetching All Notifications from the notification_tbl
export const getNotifications = async () => {
  return cache.wrap(
    "notifications",
    "all",
    async () => {
      const { rows } = await query(
        "SELECT * FROM notification_tbl ORDER BY date_created DESC"
      );
      return rows;
    },
    30 * 1000
  );
};
