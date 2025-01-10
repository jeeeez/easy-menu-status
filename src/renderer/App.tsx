import React from 'react';
import { SettingPage } from './pages/Setting';

const page = new URLSearchParams(window.location.search).get('page');
export default function App() {
  const forceUpdate = React.useReducer((x) => x + 1, 0)[1];
  React.useEffect(() => {
    (window as any).forceUpdate = forceUpdate;
  }, [forceUpdate]);
  if (page === 'setting') {
    return <SettingPage />;
  }
  return <div>App</div>;
}
