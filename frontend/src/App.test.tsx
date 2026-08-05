import { render, screen, waitFor } from '@testing-library/react';
import App from './App';

var mockApi: any;

jest.mock('./services/api-service', () => ({
  getApiService: () => mockApi
}));

describe('App', () => {
  beforeEach(() => {
    mockApi = {
      getSystemStatus: jest.fn().mockResolvedValue({ success: true, message: 'Online' })
    };
  });

  it('renders the dashboard page', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Online'));
    expect(screen.getByText('Data upload')).toBeInTheDocument();
  });
});
