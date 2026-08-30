import { Outlet } from "react-router-dom"

interface Props {

}

const ClientLayout = (props: Props) => {
    return (
        <>
            <Outlet />
        </>
    )
}

export default ClientLayout