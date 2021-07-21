import Conversation from './Conversation';
import {api} from '../js/Api';

export default class Notifications extends Conversation {
  constructor(params) {
    super({
      ...params,
      connection_id: '',
      conversation_id: 'notifications',
      name: 'Notifications',
      unread: 0,
    });
  }

  addMessages(messages, method) {
    if (!Array.isArray(messages)) {
      messages = [messages];
    }

    this.messages.push(messages);
    return this;
  }

  is(status) {
    return status == 'notifications' ? true : super.is(status);
  }

  // Disabled
  send(params = {}) { return Promise.resolve(params) }

  _addOperations() {
    this.prop('ro', 'markAsReadOp', api('/api', 'markNotificationsAsRead'));
    this.prop('ro', 'messagesOp', api('/api', 'notificationMessages'));
  }

  _skipLoad() {
    return false;
  }
}
