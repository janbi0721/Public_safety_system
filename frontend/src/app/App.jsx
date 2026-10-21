import {useRoutes} from 'react-router-dom';
import {SupervisorAuthProvider} from './auth/SupervisorAuth';
import ThemeMode from './ThemeMode';
import routes from './routes';
export default function App(){const pages=useRoutes(routes);return <ThemeMode><SupervisorAuthProvider>{pages}</SupervisorAuthProvider></ThemeMode>}
