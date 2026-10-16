# 🍈 MelonDB

Typed helpers for [WatermelonDB](https://github.com/Nozbe/WatermelonDB).

MelonDB is WatermelonDB but more DRY. WatermelonDB is excellent for building offline-first React Native apps. **MelonDB** improves the developer experience by wrapping common operations in a small, typed API you configure once per app, reducing boilerplate and making simple mistakes easier to catch.

---

## Install

```bash
npm install @alexmitchell/melondb @nozbe/watermelondb
```

```bash
yarn add @alexmitchell/melondb @nozbe/watermelondb
```

`@nozbe/watermelondb` (>= 0.27) and `react` (>= 18) are **peer dependencies**: MelonDB uses your app's copy rather than bundling its own. If you've already set up WatermelonDB you have both.

---

## Quick start

Suppose you have some note data to insert:

```ts
const draft = {
  title: "Hello",
  body: "World",
  // ...
};
```

With **WatermelonDB**, creating the row looks like this:

```ts
const noteId = await database.write(async () => {
  const note = await database.get<NoteModel>("notes").create((record) => {
    record.title = draft.title;
    record.body = draft.body;
    // ...
  });
  return note.id;
});
```

WatermelonDB requires each field to be assigned manually. TypeScript can catch a wrong type when it is assigned to a typed model property, but it does not check `draft` as a complete `notes` payload at the database call. A missing assignment is easy to overlook, and the `"notes"` string is not tied to the `NoteModel` type argument.

Once [configured](#setup), **MelonDB** reduces the same operation to:

```ts
const noteId = await melon.insert("notes", draft);
```

MelonDB uses `"notes"` to infer `TableData["notes"]`, then checks `draft` against it. A missing required property or a value with the wrong type—such as `body: 123`—causes a TypeScript error at the `insert` call. An unknown table name is rejected too.

---

## Setup

### Define your tables

You still define each model and schema the WatermelonDB way. MelonDB only replaces the repetitive database access layer.

```ts
import { Model, tableSchema } from "@nozbe/watermelondb";
import { text, readonly, date } from "@nozbe/watermelondb/decorators";

class NoteModel extends Model {
  static table = "notes";

  @text("title") title!: string;
  @text("body") body!: string;
  @readonly @date("created_at") createdAt!: Date;
}

type Note = Omit<NoteModel, keyof Model>;

const noteSchema = tableSchema({
  name: "notes",
  columns: [
    { name: "title", type: "string" },
    { name: "body", type: "string" },
    { name: "created_at", type: "number" },
  ],
});
```

### Initialize MelonDB

Then register your tables once in the app-wide configuration:

```ts
import { createMelon } from "@alexmitchell/melondb";

// Register every table in these app-wide definitions.

type TableModels = {
  notes: NoteModel;
  // ...
};

type TableData = {
  notes: Note;
  // ...
};

const tables = [
  noteSchema,
  // ...
];

const modelClasses = [
  NoteModel,
  // ...
];

export const melon = createMelon<TableModels, TableData>({
  version: 1,
  tables,
  modelClasses,
  migrations: [],
});
```

That gives you a typed `melon` instance plus the underlying `melon.db` if you need raw WatermelonDB APIs.

---

## More examples

### Batch create

Suppose you have several notes to insert:

```ts
const rows = [
  { title: "One", body: "..." },
  { title: "Two", body: "..." },
  // ...
];
```

**WatermelonDB**

```ts
await database.write(async () => {
  const collection = database.get<NoteModel>("notes");
  const prepared = rows.map((row) =>
    collection.prepareCreate((record) => {
      record.title = row.title;
      record.body = row.body;
    }),
  );
  await database.batch(prepared);
});
```

**MelonDB**

```ts
await melon.insertBatch("notes", rows);
```

---

### Fetch one row by id

WatermelonDB's `find` rejects if the row does not exist, so returning `null` instead requires handling that error yourself.

**WatermelonDB**

```ts
let note: NoteModel | null = null;
try {
  note = await database.get<NoteModel>("notes").find(id);
} catch {
  note = null;
}
```

**MelonDB**

```ts
const note = await melon.getRowById("notes", id); // NoteModel | null
```

MelonDB handles the missing-row case and returns `null`. It also infers `NoteModel` from the `"notes"` table name, so the string and model type cannot drift apart.

---

### Update one field

Updating a single column on a single row is a common operation. Suppose you want to rename a note:

```ts
const newTitle = "Renamed";
```

**WatermelonDB**

```ts
await database.write(async () => {
  await note.update((row) => {
    row.title = newTitle;
    // easy to forget a convention like updatedDate
  });
});
```

**MelonDB**

```ts
await melon.updateColumn(note, "title", newTitle);
```

`updateColumn` ties the property name to that property's value type. Because `title` is a string, TypeScript would flag `newTitle` if it were a number. If the model has an `updatedDate` property, MelonDB also sets it to `new Date().toISOString()` automatically.

For several fields:

```ts
await melon.updateColumns(note, [
  { property: "title", value: "Renamed" },
  { property: "body", value: "New body" },
]);
```

Or a full updater when you need custom logic:

```ts
await melon.updateRow(note, (row) => {
  row.title = row.title.trim();
});
```

---

### Soft-delete

WatermelonDB deletes model instances rather than IDs. If all you have is `noteId`, you must fetch the row before you can delete it:

**WatermelonDB**

```ts
const note = await database.get<NoteModel>("notes").find(noteId);

await database.write(async () => {
  await note.markAsDeleted();
});
```

**MelonDB**

```ts
await melon.deleteRowById("notes", noteId);
```

`deleteRowById` performs the lookup and soft-delete for you. If you already have the model instance, use `melon.deleteRow(note)` instead.

---

### Typed collections

**WatermelonDB**

```ts
const notes = database.get<NoteModel>("notes");
// table name is a free string; generics are easy to drift
```

**MelonDB**

```ts
const notes = melon.get("notes");
// Collection<NoteModel> — table name is keyed by TableModels
```

---

### Observable components (`withObservables`)

WatermelonDB's `withObservables` HOC is powerful but awkward to type when you also have query props and extra component props.

**WatermelonDB** (common pattern: cast and hope)

```ts
export default withObservables(["noteId"], ({ noteId }) => ({
  note: database.get("notes").findAndObserve(noteId),
}))(NoteBody) as React.ComponentType<{ noteId: string }>;
```

**MelonDB**

```ts
type Injected = { note: NoteModel };
type Query = { noteId: string };
type Props = { showTimestamp: boolean };

const enhancer = withObservables(["noteId"], ({ noteId }: Query) => ({
  note: melon.get("notes").findAndObserve(noteId),
}));

export default melon.enhance<Injected, Query, Props>(enhancer, NoteBody);
// ComponentType<{ noteId: string; showTimestamp: boolean }>
```

`enhance` is a thin typing helper: it wires `Injected` (from the HOC), `Query` (inputs that drive observables), and optional extra `Props` without fighting the HOC generics by hand.

---

### Safe database reset

Calling `unsafeResetDatabase` while React components still observe the DB can crash (see [WatermelonDB #102](https://github.com/Nozbe/WatermelonDB/issues/102)).

**WatermelonDB**

```ts
// You must coordinate unmounting observers yourself, then:
await database.write(async () => {
  await database.unsafeResetDatabase();
});
```

**MelonDB**

```ts
// Gate UI on availability:
const available = useSyncExternalStore(
  melon.subscribeDatabaseAvailable,
  melon.getDatabaseAvailable,
  melon.getDatabaseAvailable,
);

if (!available) return null;

// Later, after a schema bump or logout:
await melon.resetDatabase();
```

`resetDatabase` sets availability to `false`, waits for React to unmount gated observers, resets, then sets availability back to `true`.

---

## Platform adapters

`createMelon` / `createWatermelon` pick an adapter automatically:

| Platform      | Adapter                                     |
| ------------- | ------------------------------------------- |
| iOS / Android | SQLite (`createAdapter.ts`)                 |
| Web           | LokiJS + IndexedDB (`createAdapter.web.ts`) |

Metro and webpack resolve the `.web.ts` file on web. You do not need to branch this yourself.

---

## IDs

By default, MelonDB leaves WatermelonDB's own random id generator in place. Pass `idGenerator` to replace it globally:

```ts
createMelon({
  // ...schema
  idGenerator: () => myCustomId(),
});
```

See [Tips → UUID v7 ids](#uuid-v7-ids) for a common choice.

---

## Logging

On by default. MelonDB logs to the console (prefixed `[🍈 MelonDB]`) when `getRowById` fails and when `resetDatabase` completes. To turn that off:

```ts
createMelon({
  // ...schema
  logging: false,
});
```

`logRowCount` and `logAllRows` always print, since calling them is an explicit request for output.

---

## Exporting plain rows

When you need JSON without WatermelonDB meta (`_status`, `_changed`):

```ts
import { cleanRow } from "@alexmitchell/melondb";

const plain = cleanRow()(note);
// or merge extra fields:
const withUser = cleanRow({ user_id: userId })(note);
```

For debug logging of model instances (circular refs):

```ts
import { sanitizeCircular } from "@alexmitchell/melondb";

console.log(JSON.stringify(sanitizeCircular(note)));
```

---

## API summary

| Method                                  | Purpose                     |
| --------------------------------------- | --------------------------- |
| `melon.db`                              | Raw WatermelonDB `Database` |
| `melon.get(table)`                      | Typed `Collection`          |
| `melon.getRowById(table, id)`           | Fetch one or `null`         |
| `melon.insert(table, data)`             | Create, return id           |
| `melon.insertBatch(table, rows)`        | Batch create                |
| `melon.updateRow(model, fn)`            | Update with updater         |
| `melon.updateColumn(model, key, value)` | Single-field update         |
| `melon.updateColumns(model, cols)`      | Multi-field update          |
| `melon.deleteRow(model)`                | Soft-delete                 |
| `melon.deleteRowById(table, id)`        | Soft-delete by id           |
| `melon.deleteBatch(models)`             | Soft-delete many            |
| `melon.deleteTable(table)`              | Soft-delete all rows        |
| `melon.emptyTable(table)`               | Permanent destroy all       |
| `melon.getRowCount(table)`              | Count                       |
| `melon.logRowCount` / `logAllRows`      | Debug helpers               |
| `melon.enhance(hoc, Component)`         | Typed `withObservables`     |
| `melon.resetDatabase()`                 | Safe reset                  |
| `melon.getDatabaseAvailable()`          | Current availability flag   |
| `melon.subscribeDatabaseAvailable(fn)`  | Subscribe to that flag      |

Also exported: `createWatermelon`, `createAdapter`, `cleanRow`, `sanitizeCircular`.

---

## Type parameters

```ts
createMelon<TableModels, TableData>({ ... })
```

- `**TableModels**`: map table name → Model class instance type
- `**TableData**`: map table name → plain object shape for `insert` / `insertBatch`

Keep those two maps in sync with your schema and you get end-to-end typing for table names and insert payloads.

---

## What this is not

- Not a sync engine. No pull/push, no backend protocol.
- Not a replacement for WatermelonDB models, schemas, migrations, or queries.
- Not a full ORM. Prefer `melon.get(table).query(...)` when you need WatermelonDB's query API.

---

## Tips

### UUID v7 ids

WatermelonDB's default ids are short random strings. If you sync with a backend that uses UUID primary keys, time-ordered UUID v7 ids are a good fit: they sort by creation time and index well in Postgres.

```bash
npm install uuid react-native-get-random-values
```

```ts
import "react-native-get-random-values"; // must run before uuid, polyfills crypto.getRandomValues on React Native
import { v7 as uuidv7 } from "uuid";
import { createMelon } from "@alexmitchell/melondb";

export const melon = createMelon<TableModels, TableData>({
  // ...schema
  idGenerator: () => uuidv7(),
});
```

On web you can skip `react-native-get-random-values`, because browsers already provide `crypto.getRandomValues`.

---

## License

MIT
