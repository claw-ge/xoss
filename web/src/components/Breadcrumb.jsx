import React from 'react';

export default function Breadcrumb({ path, onNavigate }) {
  return (
    <div className="breadcrumb">
      <a onClick={() => onNavigate(null)}>根目录</a>
      {path.map((p, i) => (
        <React.Fragment key={p.id}>
          <span className="sep">/</span>
          {i === path.length - 1 ? (
            <span>{p.name}</span>
          ) : (
            <a onClick={() => onNavigate(p.id)}>{p.name}</a>
          )}
        </React.Fragment>
      ))}
    </div>
  );
}
