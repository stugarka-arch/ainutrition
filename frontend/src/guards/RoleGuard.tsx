import { Navigate, Outlet } from "react-router-dom";
import { Role } from "../interfaces/user/Role";

type Props = {
    userRole: Role | null;
    allowedRoles: Role[];
    redirectTo?: string;
};

const RoleGuard = ({ userRole, allowedRoles, redirectTo = "/" }: Props) => {
    console.log("🔍 RoleGuard:");
    console.log("  userRole:", userRole);
    console.log("  allowedRoles:", allowedRoles);

    // ⚠️ Якщо userRole = null - редірект на login
    if (!userRole) {
        console.log("❌ No user role");
        return <Navigate to="/auth" replace />;
    }

    // ✅ Перевіряємо чи роль в дозволених
    if (!allowedRoles.includes(userRole)) {
        console.log(`❌ Role "${userRole}" not allowed. Allowed: ${allowedRoles}`);
        return <Navigate to={redirectTo} replace />;
    }

    console.log("✅ Access granted");
    return <Outlet />;
};

export default RoleGuard;