export default function PageHead({ title, description, children }) {
  return (
    <div className="page-head">
      <div>
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
      </div>
      {children ? <div className="page-head-actions">{children}</div> : null}
    </div>
  );
}
