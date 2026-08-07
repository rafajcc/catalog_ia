import { screen, waitFor } from '@testing-library/react';
import { renderWithI18n } from '../../test-utils';
import userEvent from '@testing-library/user-event';
import ReviewPanel from './ReviewPanel';

var mockApi: any;

jest.mock('../../services/api-service', () => ({
  getApiService: () => mockApi
}));

jest.mock('../../utils/download', () => ({
  ...jest.requireActual('../../utils/download'),
  downloadBlob: jest.fn()
}));

import { downloadBlob } from '../../utils/download';

const mockedDownloadBlob = downloadBlob as jest.Mock;

const review = {
  total_products: 4,
  valid_count: 2,
  invalid_count: 1,
  warning_count: 1,
  suggested_count: 3,
  images_selected_count: 2,
  products: []
};

describe('ReviewPanel', () => {
  beforeEach(() => {
    mockApi = {
      getReviewState: jest.fn(),
      batchReviewAction: jest.fn(),
      exportReviewState: jest.fn()
    };
  });

  it('loads the review state and shows the summary', async () => {
    mockApi.getReviewState.mockResolvedValue({ success: true, data: review });
    renderWithI18n(<ReviewPanel dataId="d1" />, 'en');

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Load review state' }));

    await waitFor(() => expect(mockApi.getReviewState).toHaveBeenCalledWith('d1'));
    expect(await screen.findByText('4 products')).toBeInTheDocument();
    expect(screen.getByText('2 valid')).toBeInTheDocument();
    expect(screen.getByText('1 invalid')).toBeInTheDocument();
    expect(screen.getByText('3 with suggestions')).toBeInTheDocument();
  });

  it('accepts all changes via the batch action', async () => {
    mockApi.getReviewState.mockResolvedValue({ success: true, data: review });
    mockApi.batchReviewAction.mockResolvedValue({ success: true });
    renderWithI18n(<ReviewPanel dataId="d1" />, 'en');

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Load review state' }));
    await user.click(await screen.findByRole('button', { name: 'Accept all' }));

    await waitFor(() => expect(mockApi.batchReviewAction).toHaveBeenCalledWith('d1', 'accept_all'));
    expect(await screen.findByText('All changes accepted')).toBeInTheDocument();
  });

  it('marks the review as completed and notifies the parent', async () => {
    mockApi.getReviewState.mockResolvedValue({ success: true, data: review });
    const onReviewCompleted = jest.fn();
    renderWithI18n(<ReviewPanel dataId="d1" onReviewCompleted={onReviewCompleted} />, 'en');

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Load review state' }));
    await user.click(await screen.findByRole('button', { name: 'Mark review as completed' }));

    expect(onReviewCompleted).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Review completed.')).toBeInTheDocument();
  });

  it('exports the review state as a file', async () => {
    mockApi.getReviewState.mockResolvedValue({ success: true, data: review });
    mockApi.exportReviewState.mockResolvedValue(new Blob(['{}'], { type: 'application/json' }));
    renderWithI18n(<ReviewPanel dataId="d1" />, 'en');

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Load review state' }));
    await user.click(await screen.findByRole('button', { name: 'Export' }));

    await waitFor(() => expect(mockApi.exportReviewState).toHaveBeenCalledWith('d1'));
    expect(mockedDownloadBlob).toHaveBeenCalledWith(expect.any(Blob), 'review_d1.json');
    expect(await screen.findByText('Review state exported')).toBeInTheDocument();
  });

  it('shows an error when loading fails', async () => {
    mockApi.getReviewState.mockRejectedValue(new Error('state not found'));
    renderWithI18n(<ReviewPanel dataId="d1" />, 'en');

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Load review state' }));

    expect(await screen.findByText('state not found')).toBeInTheDocument();
  });
});

