import { SetMetadata } from '@nestjs/common';

export const SCOPED_BY_STORE_KEY = 'scopedByStore';

export interface ScopedByStoreMeta {
    table: string;
    pkColumn: string;
    paramName: string;
}

/**
 * Defense-in-depth for a `:id`-shaped route: before the handler runs, StoreOwnershipGuard checks
 * that the target row's id_magasin matches the caller's store, independently of whatever the
 * service itself does. Catches the common IDOR shape even if a service forgets its own filter.
 */
export const ScopedByStore = (table: string, pkColumn: string, paramName = 'id') =>
    SetMetadata(SCOPED_BY_STORE_KEY, { table, pkColumn, paramName } as ScopedByStoreMeta);
