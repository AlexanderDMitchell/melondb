import { appSchema, Database } from '@nozbe/watermelondb'
import { DatabaseProps } from '@nozbe/watermelondb/Database'
import { AppSchemaSpec } from '@nozbe/watermelondb/Schema'
import {
  schemaMigrations,
  SchemaMigrationsSpec,
} from '@nozbe/watermelondb/Schema/migrations'
import { createAdapter } from './createAdapter'

export type WatermelonParams = {
  version: AppSchemaSpec['version']
  tables: AppSchemaSpec['tables']
  migrations: SchemaMigrationsSpec['migrations']
  modelClasses: DatabaseProps['modelClasses']
}

/**
 * Create a WatermelonDB `Database` with the usual schema + migrations setup,
 * and a platform adapter (SQLite on native, LokiJS on web).
 */
export const createWatermelon = ({
  version,
  tables,
  migrations,
  modelClasses,
}: WatermelonParams) => {
  const schema = appSchema({
    version,
    tables,
  })

  const migrationConfig = schemaMigrations({
    migrations,
  })

  const adapter = createAdapter({ schema, migrations: migrationConfig })

  return new Database({
    adapter,
    modelClasses,
  })
}
