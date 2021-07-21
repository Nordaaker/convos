import Notifications from '../../assets/store/Notifications';

test('constructor', () => {
  let c = new Notifications({});
  expect(c.connection_id).toBe('');
  expect(c.conversation_id).toBe('notifications');
  expect(c.name).toBe('Notifications');
  expect(c.status).toBe('pending');
  expect(c.unread).toBe(0);
});

test('is', () => {
  let c = new Notifications({});
  expect(c.is('notifications')).toBe(true);
});

test('addMessages', () => {
  let c = new Notifications({});

  c.addMessages([{message: ''}]);
  c.addMessages({message: 'cool beans'});
  expect(c.messages.length).toBe(2);
});

test('load', () => {
  let c = new Notifications({});

  expect(c._skipLoad()).toBe(false);
  expect(c.markAsReadOp.id).toBe('markNotificationsAsRead');
  expect(c.messagesOp.id).toBe('notificationMessages');
});

test('send', async () => {
  let c = new Notifications({});
  expect(await c.send({whatever: 42})).toEqual({whatever: 42});
});
