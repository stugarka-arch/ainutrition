export const Role = {
    USER: 'USER',
    ADMIN: 'ADMIN',
    GUEST: 'GUEST'


} as const;

export type Role = typeof Role[keyof typeof Role];