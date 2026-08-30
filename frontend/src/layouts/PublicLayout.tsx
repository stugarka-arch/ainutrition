import { Outlet } from "react-router-dom"
import { useEffect } from "react";



const PublicLayout = () => {

    useEffect(() => {

    }, [])


    return (
        <div className="flex-column">


            <Outlet />
        </div>
    )
}

export default PublicLayout