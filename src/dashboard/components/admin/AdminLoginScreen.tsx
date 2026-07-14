import {useNavigate} from "@/src/dashboard/next-navigation";
import styles from "./AdminErrorScreen.module.css"

const AdminLoginScreen = () => {
    const navigate = useNavigate();

    return (
        <div className={styles.adminErrorContainer}>
            <h2>Unauthorized</h2>
            <p>Please log in to access the admin panel.</p>
            <button onClick={() => navigate("/auth")}>Go to Login</button>
        </div>
    );
}

export default AdminLoginScreen;