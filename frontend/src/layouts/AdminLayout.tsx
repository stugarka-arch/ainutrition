import { Outlet } from "react-router-dom";
import Header from "../components/Header";

const AdminLayout = () => {
    return (
        <>
            <Header />
            <Outlet />
        </>
    );
};

export default AdminLayout
