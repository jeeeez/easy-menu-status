import React from 'react';

export function SettingPage() {
  React.useEffect(() => {
    document.title = 'Setting';
  }, []);
  return <div>{JSON.stringify(window.config, null, 2)}</div>;
}
