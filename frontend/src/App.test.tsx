import { render, screen, waitFor } from '@testing-library/react';
import App from './App';

var mockApi: any;

jest.mock('./services/api-service', () => ({
  getApiService: () => mockApi
}));

describe('App', () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockApi = {
      getSystemStatus: jest.fn().mockResolvedValue({ success: true, message: 'Online' }),
      getUploads: jest.fn().mockResolvedValue({ success: true, data: { csvs: [], images: [] } })
    };
  });

  it('renders the dashboard page in Spanish by default', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('En línea'));
    expect(screen.getByText('Subida de datos')).toBeInTheDocument();
  });

  it('renders in English when the language preference is stored', async () => {
    window.localStorage.setItem('catalogia_lang', 'en');
    render(<App />);
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Online'));
    expect(screen.getByText('Data upload')).toBeInTheDocument();
  });
});
