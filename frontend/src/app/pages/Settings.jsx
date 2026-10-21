import {Box,Typography,Card,CardContent} from '@mui/material';import ModeSelect from '../components/ModeSelect';
export default function Settings(){return <Box sx={{p:3}}><Typography variant="h5" fontWeight={700} mb={3}>一般設定</Typography><Card variant="outlined"><CardContent><ModeSelect/></CardContent></Card></Box>}
