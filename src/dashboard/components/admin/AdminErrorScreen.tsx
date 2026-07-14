import styles from "./AdminErrorScreen.module.css"

interface AdminErrorScreenProps{
    header?: string;
    content?: string;
}

const AdminErrorScreen = ({header, content}: AdminErrorScreenProps) => {
  return (
      <div className={styles.adminErrorContainer}>
          <h2>{header || "Error loading data"}</h2>
          <p>{content || "An unknown error has occurred."}</p>
          <button onClick={() => window.location.reload()}>Retry</button>
      </div>
  );
}

export default AdminErrorScreen;