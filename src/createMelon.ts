import { ComponentType } from "react";
import { Collection, Model, Q } from "@nozbe/watermelondb";
import { setGenerator } from "@nozbe/watermelondb/utils/common/randomId";
import { createWatermelon, WatermelonParams } from "./createWatermelon";
import { sanitizeCircular } from "./sanitizeCircular";

export type Melon = ReturnType<typeof createMelon>;

export type MelonParams = WatermelonParams & {
  /** Console logging for failed lookups and database resets. Defaults to `true`. */
  logging?: boolean;
  /** Replaces WatermelonDB's global id generator. Defaults to WatermelonDB's own generator. */
  idGenerator?: () => string;
};

export const createMelon = <
  TableModels extends Record<string, Model>,
  TableData extends Record<keyof TableModels, unknown>,
>(
  params: MelonParams,
) => {
  type TableNames = Extract<keyof TableModels, string>;

  const logging = params.logging ?? true;
  if (params.idGenerator) {
    setGenerator(params.idGenerator);
  }

  const watermelon = createWatermelon(params);

  /**
   * Enhance a component with observable data while keeping strong type safety.
   *
   * @template Injected - Props injected into the component by the enhancer.
   * @template Query - Props required by the enhancer (used to trigger observables).
   * @template Props - Additional props required by the component (not used by the enhancer).
   */
  const enhance = <Injected, Query = unknown, Props = unknown>(
    enhancer: (
      Component: ComponentType<Injected & Props>,
    ) => ComponentType<Query & Props>,
    Component: ComponentType<Injected & Props>,
  ): ComponentType<Query & Props> => {
    return enhancer(Component);
  };

  const get = <T extends TableNames>(tableName: T) => {
    return watermelon.get(tableName) as unknown as Collection<TableModels[T]>;
  };

  const getRowById = async <T extends TableNames>(tableName: T, id: string) => {
    try {
      const rows = await get(tableName).query(Q.where("id", id)).fetch();
      return rows[0] ?? null;
    } catch {
      if (logging) {
        console.error("[🍈 MelonDB] Cannot find row:", tableName, id);
      }
      return null;
    }
  };

  const insert = async <T extends TableNames>(
    tableName: T,
    data: TableData[T],
  ): Promise<string> => {
    return await watermelon.write(async () => {
      const collection = get(tableName);
      const record = await collection.create((record) => {
        Object.assign(record, data);
      });
      return record.id;
    });
  };

  const insertBatch = async <T extends TableNames>(
    tableName: T,
    data: TableData[T][],
  ) => {
    return await watermelon.write(async () => {
      const collection = get(tableName);
      const newRows = data.map((row) =>
        collection.prepareCreate((record) => {
          Object.assign(record, row);
        }),
      );
      await watermelon.batch(newRows);
    });
  };

  const updateRow = async <T extends TableNames>(
    model: TableModels[T],
    updater: (row: TableModels[T]) => void,
  ) => {
    return await watermelon.write(() => model.update(updater));
  };

  /**
   * Update one column inside a write transaction.
   * If the model has an `updatedDate` field, it is set to now (ISO string).
   */
  const updateColumn = <M extends Model, P extends keyof M, V extends M[P]>(
    model: M,
    property: P,
    value: V,
  ) => {
    return model.database.write(() => {
      return model.update((row) => {
        row[property] = value;
        if ("updatedDate" in row) {
          row.updatedDate = new Date().toISOString();
        }
      });
    });
  };

  /**
   * Update several columns in one write transaction.
   * If the model has an `updatedDate` field, it is set to now (ISO string).
   */
  const updateColumns = <M extends Model, P extends keyof M, V extends M[P]>(
    model: M,
    columns: { property: P; value: V }[],
  ) => {
    return model.database.write(() => {
      return model.update((row) => {
        columns.forEach(({ property, value }) => {
          row[property] = value;
        });
        if ("updatedDate" in row) {
          row.updatedDate = new Date().toISOString();
        }
      });
    });
  };

  const deleteRow = async <T extends Model>(row: T) => {
    await watermelon.write(async () => {
      await row.markAsDeleted();
    });
  };

  const deleteRowById = async <T extends TableNames>(
    tableName: T,
    id: string | undefined,
  ) => {
    if (!id) {
      return;
    }
    const row = await getRowById(tableName, id);
    if (!row) {
      return;
    }
    return await deleteRow(row);
  };

  const deleteBatch = async <T extends Model>(rows: T[]) => {
    if (rows.length === 0) {
      return;
    }

    await rows[0].collection.database.write(async () => {
      for (const row of rows) {
        await row.markAsDeleted();
      }
    });
  };

  /**
   * Soft-delete every row in a table (`markAsDeleted`) in one write transaction.
   */
  const deleteTable = async <T extends TableNames>(tableName: T) => {
    await watermelon.write(async () => {
      const collection = watermelon.collections.get(tableName);
      const records = await collection.query().fetch();

      if (records.length === 0) {
        return;
      }

      for (const record of records) {
        await record.markAsDeleted();
      }
    });
  };

  /**
   * Permanently destroy every row in a table, in batched writes.
   */
  const emptyTable = async <T extends TableNames>(
    tableName: T,
    batchSize = 500,
  ) => {
    await watermelon.write(async () => {
      const collection = watermelon.collections.get(tableName);
      const records = await collection.query().fetch();

      if (records.length === 0) {
        return;
      }

      for (let i = 0; i < records.length; i += batchSize) {
        const chunk = records.slice(i, i + batchSize);
        const prepared = chunk.map((r) => r.prepareDestroyPermanently());
        await watermelon.batch(prepared);
      }
    });
  };

  const getRowCount = async (tableName: TableNames) => {
    return await get(tableName).query().fetchCount();
  };

  const logRowCount = async (tableName: TableNames) => {
    const count = await getRowCount(tableName);
    console.log(`[🍈 MelonDB] Total ${tableName} rows in DB: ${count}`);
  };

  const logAllRows = async (tableName: TableNames) => {
    const rows = await get(tableName).query().fetch();
    for (const row of rows) {
      console.log(JSON.stringify(sanitizeCircular(row)));
    }
  };

  // Observers must unmount before unsafeResetDatabase — see WatermelonDB #102
  let databaseAvailable = true;
  const databaseAvailableListeners = new Set<(available: boolean) => void>();

  const getDatabaseAvailable = () => databaseAvailable;

  const subscribeDatabaseAvailable = (
    listener: (available: boolean) => void,
  ) => {
    databaseAvailableListeners.add(listener);
    return () => {
      databaseAvailableListeners.delete(listener);
    };
  };

  const setDatabaseAvailable = (available: boolean) => {
    if (databaseAvailable === available) {
      return;
    }
    databaseAvailable = available;
    databaseAvailableListeners.forEach((listener) => listener(available));
  };

  /**
   * Reset the database safely: flip `databaseAvailable` to false first so UI
   * that subscribes can unmount observers, then call `unsafeResetDatabase`.
   */
  const resetDatabase = async () => {
    setDatabaseAvailable(false);
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => resolve());
      });
    });
    // Yield a macrotask so React can finish unmounting observers before we wipe the DB.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    try {
      await watermelon.write(async () => {
        await watermelon.unsafeResetDatabase();
        if (logging) {
          console.log("[🍈 MelonDB] Database reset");
        }
      });
    } finally {
      setDatabaseAvailable(true);
    }
  };

  return {
    /** Underlying WatermelonDB `Database` instance. */
    db: watermelon,
    enhance,
    get,
    getRowById,
    insert,
    insertBatch,
    updateRow,
    updateColumn,
    updateColumns,
    deleteRow,
    deleteRowById,
    deleteBatch,
    deleteTable,
    emptyTable,
    getRowCount,
    logRowCount,
    logAllRows,
    resetDatabase,
    getDatabaseAvailable,
    subscribeDatabaseAvailable,
  };
};
