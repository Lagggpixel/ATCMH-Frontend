import styles from "./AdminLoadingScreen.module.css"

const AdminLoadingScreen = () => {
    return (
        <div className={styles.adminLoadingContainer}>
            <div className={styles.adminLoadingSpinner}></div>
            <p>Loading data...</p>
        </div>
    );
}

export default AdminLoadingScreen;