import { getDb } from '../../db/client.js';

export interface Role {
  code: string;
  name: string;
  description: string | null;
  isSystem: boolean;
}

export interface Menu {
  code: string;
  name: string;
  icon: string | null;
  sortOrder: number;
}

export interface Permission {
  menu: string;
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

interface RoleRow {
  code: string;
  name: string;
  description: string | null;
  is_system: number;
}

interface PermissionRow {
  menu_code: string;
  can_view: number;
  can_create: number;
  can_edit: number;
  can_delete: number;
}

function toPermission(row: PermissionRow): Permission {
  return {
    menu: row.menu_code,
    canView: Boolean(row.can_view),
    canCreate: Boolean(row.can_create),
    canEdit: Boolean(row.can_edit),
    canDelete: Boolean(row.can_delete),
  };
}

export function listRoles(): Role[] {
  return getDb()
    .prepare<[], RoleRow>('SELECT code, name, description, is_system FROM roles ORDER BY name')
    .all()
    .map((row) => ({
      code: row.code,
      name: row.name,
      description: row.description,
      isSystem: Boolean(row.is_system),
    }));
}

export function roleExists(code: string): boolean {
  return Boolean(getDb().prepare('SELECT 1 FROM roles WHERE code = ?').get(code));
}

export function listMenus(): Menu[] {
  return getDb()
    .prepare<[], { code: string; name: string; icon: string | null; sort_order: number }>(
      'SELECT code, name, icon, sort_order FROM menus ORDER BY sort_order',
    )
    .all()
    .map((row) => ({
      code: row.code,
      name: row.name,
      icon: row.icon,
      sortOrder: row.sort_order,
    }));
}

/** Every permission granted to a role, keyed by menu code. */
export function listPermissionsForRole(role: string): Permission[] {
  return getDb()
    .prepare<[string], PermissionRow>(
      `SELECT menu_code, can_view, can_create, can_edit, can_delete
         FROM role_permissions WHERE role_code = ?`,
    )
    .all(role)
    .map(toPermission);
}

export function getPermission(role: string, menu: string): Permission | null {
  const row = getDb()
    .prepare<[string, string], PermissionRow>(
      `SELECT menu_code, can_view, can_create, can_edit, can_delete
         FROM role_permissions WHERE role_code = ? AND menu_code = ?`,
    )
    .get(role, menu);

  return row ? toPermission(row) : null;
}
