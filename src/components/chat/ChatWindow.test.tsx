/** @vitest-environment jsdom */
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createDataStreamResponse, formatDataStreamPart } from 'ai';
import { ChatWindow } from './ChatWindow';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it('the real chat hook sends the assistant date annotation with a follow-up request', async () => {
  const annotation = { type: 'recommendation-period', period: { start: '2026-10-06', end: '2026-10-06' } };
  const reply = (text: string) => createDataStreamResponse({ execute: writer => {
    writer.writeMessageAnnotation(annotation);
    writer.write(formatDataStreamPart('text', text));
    writer.write(formatDataStreamPart('finish_message', { finishReason: 'stop' }));
  } });
  const fetch = vi.spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(reply('Wtorek, 2026-10-06: pierogi.'))
    .mockResolvedValueOnce(reply('Wtorek, 2026-10-06: kurczak.'));
  render(<ChatWindow />);
  const input = screen.getByRole('textbox', { name: 'Wiadomość do czatu' });
  fireEvent.change(input, { target: { value: 'Na jutro' } });
  fireEvent.click(screen.getByRole('button', { name: 'Wyślij wiadomość' }));
  await screen.findByText('Wtorek, 2026-10-06: pierogi.');
  await waitFor(() => expect(input).not.toBeDisabled());
  fireEvent.change(input, { target: { value: 'A coś z mięsem?' } });
  fireEvent.click(screen.getByRole('button', { name: 'Wyślij wiadomość' }));
  await screen.findByText('Wtorek, 2026-10-06: kurczak.');
  const body = JSON.parse(String(fetch.mock.calls[1][1]?.body));
  expect(body.messages[1]).toMatchObject({ role: 'assistant', annotations: [annotation] });
  expect(body.messages[2]).toMatchObject({ role: 'user', content: 'A coś z mięsem?' });
});
