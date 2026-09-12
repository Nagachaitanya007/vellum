/**
 * Kysely dialect for Better Auth over the shared libSQL / Turso client.
 * Resolves `getClient` on first connection so migrations can finish first.
 */
import type { Client, InValue } from "@libsql/client";
import {
  CompiledQuery,
  type DatabaseConnection,
  type DatabaseIntrospector,
  type Dialect,
  type Driver,
  type Kysely,
  type QueryCompiler,
  type QueryResult,
  type TransactionSettings,
  SqliteAdapter,
  SqliteIntrospector,
  SqliteQueryCompiler,
} from "kysely";

export function libsqlDialect(getClient: () => Promise<Client> | Client): Dialect {
  return {
    createAdapter: () => new SqliteAdapter(),
    createDriver: () => new LazyLibsqlDriver(getClient),
    createQueryCompiler: (): QueryCompiler => new SqliteQueryCompiler(),
    createIntrospector: (db: Kysely<unknown>): DatabaseIntrospector => new SqliteIntrospector(db),
  };
}

class LazyLibsqlDriver implements Driver {
  private client: Client | undefined;
  private connection: LibsqlConnection | undefined;
  private queue: Array<(con: LibsqlConnection) => void> = [];

  constructor(private readonly getClient: () => Promise<Client> | Client) {}

  async init(): Promise<void> {
    this.client = await this.getClient();
  }

  async acquireConnection(): Promise<DatabaseConnection> {
    if (this.client === undefined) {
      this.client = await this.getClient();
    }
    if (this.connection !== undefined) {
      return new Promise((resolve) => {
        this.queue.push(resolve);
      });
    }
    this.connection = new LibsqlConnection(this.client);
    return this.connection;
  }

  async releaseConnection(connection: DatabaseConnection): Promise<void> {
    if (connection !== this.connection) {
      throw new Error("Invalid connection");
    }
    const next = this.queue.shift();
    if (next === undefined) {
      this.connection = undefined;
      return;
    }
    next(this.connection);
  }

  async beginTransaction(conn: DatabaseConnection, _settings: TransactionSettings): Promise<void> {
    await (conn as LibsqlConnection).executeQuery(CompiledQuery.raw("begin"));
  }

  async commitTransaction(conn: DatabaseConnection): Promise<void> {
    await (conn as LibsqlConnection).executeQuery(CompiledQuery.raw("commit"));
  }

  async rollbackTransaction(conn: DatabaseConnection): Promise<void> {
    await (conn as LibsqlConnection).executeQuery(CompiledQuery.raw("rollback"));
  }

  async destroy(): Promise<void> {
    this.client = undefined;
    this.connection = undefined;
    this.queue = [];
  }
}

class LibsqlConnection implements DatabaseConnection {
  constructor(private readonly client: Client) {}

  async executeQuery<O>(compiledQuery: CompiledQuery): Promise<QueryResult<O>> {
    const result = await this.client.execute({
      sql: compiledQuery.sql,
      args: compiledQuery.parameters as InValue[],
    });
    return {
      rows: result.rows as O[],
      numAffectedRows: BigInt(result.rowsAffected ?? 0),
    };
  }

  async *streamQuery<O>(
    compiledQuery: CompiledQuery,
    chunkSize: number,
  ): AsyncIterableIterator<QueryResult<O>> {
    if (!Number.isInteger(chunkSize) || chunkSize <= 0) {
      throw new Error("chunkSize must be a positive integer");
    }
    const result = await this.executeQuery<O>(compiledQuery);
    for (let i = 0; i < result.rows.length; i += chunkSize) {
      yield { rows: result.rows.slice(i, i + chunkSize) };
    }
  }
}
