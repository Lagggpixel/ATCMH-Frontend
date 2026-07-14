import AdminErrorScreen from "./AdminErrorScreen.tsx";

const AdminUnauthorizedScreen = () => {
    return <AdminErrorScreen header="Unauthorized" content="You must hold moderator or mentor rank in the ATCMH discord to view this page"/>;
}

export default AdminUnauthorizedScreen;