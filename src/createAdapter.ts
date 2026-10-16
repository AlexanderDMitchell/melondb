import SQLiteAdapter from "@nozbe/watermelondb/adapters/sqlite";
import { SQLiteAdapterOptions } from "@nozbe/watermelondb/adapters/sqlite/type";

/** Native (iOS / Android) SQLite adapter. */
export const createAdapter = (options: SQLiteAdapterOptions) => {
  return new SQLiteAdapter(options);
};
