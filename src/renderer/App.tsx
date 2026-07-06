import { QuickCommandPage } from './pages/QuickCommand';
import { SettingPage } from './pages/Setting';
import './App.css';

const page = new URLSearchParams(window.location.search).get('page');
document.body.dataset.page = page || 'home';

export default function App() {
  if (page === 'setting') {
    return <SettingPage />;
  }
  if (page === 'quick-command') {
    return <QuickCommandPage />;
  }
  return <div>App</div>;
}
