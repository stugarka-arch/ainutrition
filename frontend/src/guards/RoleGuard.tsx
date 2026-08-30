import { Navigate, Outlet } from "react-router-dom";
import type { Role } from "../interfaces/user/Role";

type Props = {
    userRole: Role | null;       // роль користувача (може бути null, якщо не авторизований)
    allowedRoles: Role[];        // масив дозволених ролей
    redirectTo?: string;         // куди редіректити якщо доступ заборонений
};

const RoleGuard = ({ userRole, allowedRoles, redirectTo = "/" }: Props) => {
    // якщо користувач не авторизований або його роль не дозволена
    console.log('userRole- ', userRole);
    console.log('allowedRoles- ', allowedRoles);
    if (!userRole || !allowedRoles.includes(userRole)) {
        return <Navigate to={redirectTo} replace />;
    }

    // роль дозволена → рендеримо дочірні маршрути
    return <Outlet />;
};

export default RoleGuard;