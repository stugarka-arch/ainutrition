import { Outlet } from "react-router-dom"
import { useEffect } from "react";
import Header from "../components/Header";



const PublicLayout = () => {

    useEffect(() => {

    }, [])


    return (
        <div className="flex-column">
            <Header />
            <Outlet />
        </div>
    )
}

export default PublicLayout
