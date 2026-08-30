import { Outlet } from "react-router-dom"

interface Props {

}

const AdminLayout = (props: Props) => {
    return (
        <>
            <Outlet />
        </>
    )
}

export default AdminLayout