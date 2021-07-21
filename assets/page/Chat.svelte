<script>
import Button from '../components/form/Button.svelte';
import ChatHeader from '../components/ChatHeader.svelte';
import ChatInput from '../components/ChatInput.svelte';
import ConnectionSettings from '../components/ConnectionSettings.svelte';
import ConversationSettings from '../components/ConversationSettings.svelte';
import DragAndDrop from '../js/DragAndDrop';
import Icon from '../components/Icon.svelte';
import InfinityScroll from '../components/InfinityScroll.svelte';
import Link from '../components/Link.svelte';
import Time from '../js/Time';
import {activeMenu, generateWriteable, viewport} from '../store/writable';
import {chatHelper, renderEmbed, topicOrStatus, videoWindow} from '../js/chatHelpers';
import {fade} from 'svelte/transition';
import {getContext, onDestroy, onMount} from 'svelte';
import {isISOTimeString} from '../js/Time';
import {l, lmd} from '../store/I18N';
import {modeClassNames} from '../js/util';
import {notify} from '../js/Notify';
import {route} from '../store/Route';

export let connection_id = '';
export let conversation_id = '';
export let title = 'Chat';

const dragAndDrop = new DragAndDrop();
const socket = getContext('socket');
const user = getContext('user');
const popoverTarget = generateWriteable('chat:popoverTarget');

let connection = user.notifications;
let conversation = user.notifications;
let messages = conversation.messages;
let participants = conversation.participants;
let now = new Time();
let onLoadHash = '';
let unsubscribe = {};
let focusChatInput, fillIn, uploader;

$: setConversationFromRoute(connection_id, conversation_id);
$: setConversationFromUser($user);
$: updateNotificationCount($user);
$: messages.update({expandUrlToMedia: $user.expandUrlToMedia});
$: notConnected = $conversation.frozen ? true : false;
$: title = $conversation.title;
$: if (!$route.hash && !$conversation.historyStopAt) conversation.load({});

$: onInfinityScrolled = chatHelper('onInfinityScrolled', {conversation});
$: onInfinityVisibility = chatHelper('onInfinityVisibility', {conversation, onLoadHash});
$: onMessageClick = chatHelper('onMessageClick', {conversation, fillIn, focusChatInput, popoverTarget, user});

onMount(() => {
  popoverTarget.set('');
  dragAndDrop.attach(document.querySelector('.main'), uploader);
});

onDestroy(() => {
  Object.keys(unsubscribe).forEach(name => unsubscribe[name]());
  dragAndDrop.detach();
});

function conversationToUri() {
  const [scheme, host] = $conversation.connection_id.split('-');
  return scheme + '://' + host + '/' + encodeURIComponent($conversation.conversation_id) + '?tls=1';
}

function setConversationFromRoute(connection_id, conversation_id) {
  if (conversation.connection_id == connection_id && conversation.conversation_id == conversation_id) return;
  user.setActiveConversation({connection_id, conversation_id}); // Triggers setConversationFromUser()
  popoverTarget.set('');
}

function setConversationFromUser(user) {
  if (user.activeConversation == conversation) return;
  if (unsubscribe.conversation) unsubscribe.conversation();
  if (unsubscribe.markAsRead) unsubscribe.markAsRead();

  conversation = user.activeConversation;
  messages = conversation.messages;
  participants = conversation.participants;
  connection = user.findConversation({connection_id: conversation.connection_id}) || conversation;
  now = new Time();
  unsubscribe.conversation = conversation.subscribe(d => { conversation = d });
  unsubscribe.markAsRead = conversation.markAsRead.bind(conversation);

  onLoadHash = isISOTimeString(route.hash) && route.hash || '';
  if (onLoadHash) return conversation.load({around: onLoadHash});
  if (!conversation.historyStopAt) return conversation.load({around: now.toISOString()});
}

function showPopover(e) {
  const {relatedTarget, target, type} = e;
  setTimeout(() => {
    if (type == 'mouseout') {
      if (!relatedTarget || !relatedTarget.closest('.popover')) $popoverTarget = null;
    }
    else {
      if (!$popoverTarget) target.click();
    }
  }, 250);
}

function updateNotificationCount(user) {
  user.activeConversation.update({notifications: 0});
  user.updateNotificationCount();
}
</script>

<ChatHeader>
  <h1 class="ellipsis"><a href="#settings" on:click="{activeMenu.toggle}">{$l(conversation.name)}</a></h1>
  <span class="chat-header__topic ellipsis">{topicOrStatus($connection, $conversation)}</span>
  {#if !$conversation.is('not_found')}
    <a href="#settings" class="btn-hallow" class:is-active="{$activeMenu == 'settings'}" on:click="{activeMenu.toggle}">
      <Icon name="users-cog"/>
      <Icon name="times"/>
    </a>
  {/if}
</ChatHeader>

{#if $activeMenu == 'settings'}
  {#if conversation_id}
    <ConversationSettings conversation="{conversation}" transition="{{duration: 250, x: $viewport.nColumns > 1 ? 0 : $viewport.width}}"/>
  {:else}
    <ConnectionSettings conversation="{conversation}" transition="{{duration: 250, x: $viewport.nColumns > 1 ? 0 : $viewport.width}}"/>
  {/if}
{/if}

<InfinityScroll class="main is-above-chat-input" on:scrolled="{onInfinityScrolled}" on:visibility="{onInfinityVisibility}">
  <!-- welcome message -->
  {#if $messages.length < 10 && !$conversation.is('not_found')}
    {#if $conversation.is('private')}
      <p><Icon name="info-circle"/> {@html $lmd('This is a private conversation with "%1".', $conversation.name)}</p>
    {:else if !$conversation.frozen}
      <p>
        <Icon name="info-circle"/> 
        {@html $lmd($conversation.topic ? 'Topic for %1 is: %2': 'No topic is set for %1.', $conversation.name, $conversation.topic)}
      </p>
      <p>
        <Icon name="info-circle"/> 
        {#if $participants.length == 1}
          {$l('You are the only participant in this conversation.')}
        {:else}
          {@html $lmd('There are %1 participants in this conversation.', $participants.length)}
        {/if}
      </p>
    {/if}
  {/if}

  <!-- status -->
  {#if $conversation.is('loading') && $messages.length > 10}
    <div class="message__status-line for-loading has-pos-top"><span><Icon name="spinner" animation="spin"/> <i>{$l('Loading...')}</i></span></div>
  {/if}
  {#if $conversation.historyStartAt && !$conversation.is('not_found') && $messages.length}
    <div class="message__status-line for-start-of-history"><span><Icon name="calendar-alt"/> <i>{$l('Started chatting on %1', $conversation.historyStartAt.getHumanDate())}</i></span></div>
  {/if}

  <!-- messages -->
  {#each $messages.render() as message, i}
    {#if message.dayChanged}
      <div class="message__status-line for-day-changed"><span><Icon name="calendar-alt"/> <i>{message.ts.getHumanDate()}</i></span></div>
    {/if}

    {#if i && i == $messages.length - $conversation.unread}
      <div class="message__status-line for-last-read"><span><Icon name="comments"/> {$l('New messages')}</span></div>
    {/if}

    <div class="{message.className}" class:is-not-present="{!$participants.get(message.from)}" class:show-details="{!!message.showDetails}" data-index="{i}" data-ts="{message.ts.toISOString()}" on:click="{onMessageClick}">
      <Icon name="pick:{message.from}" color="{message.color}"/>
      <div class="message__ts has-tooltip" data-content="{message.ts.format('%H:%M')}"><div>{message.ts.toLocaleString()}</div></div>
      <a href="#popover:{message.id}" on:mouseover="{showPopover}" on:mouseout="{showPopover}" class="message__from" style="color:{message.color}" tabindex="-1">{message.from}</a>
      <div class="message__text">
        {#if message.waitingForResponse === false}
          <a href="#action:remove" class="pull-right has-tooltip" data-tooltip="{$l('Remove')}"><Icon name="times-circle"/></a>
          <a href="#action:resend" class="pull-right has-tooltip " data-tooltip="{$l('Resend')}"><Icon name="sync-alt"/></a>
        {:else if !message.waitingForResponse && message.details}
          <a href="#action:details:{message.index}"><Icon name="{message.showDetails ? 'caret-square-up' : 'caret-square-down'}"/></a>
        {/if}
        {@html message.markdown}
      </div>
      {#each message.embeds as embedPromise}
        {#await embedPromise}
          <!-- loading embed -->
        {:then embed}
          <div class="embed {embed.className}" use:renderEmbed="{embed}"/>
        {/await}
      {/each}
      {#if $popoverTarget == message.id}
        <div class="popover" transition:fade="{{duration: 200}}" on:mouseout="{showPopover}">
          <a href="#action:mention:{message.from}" class="on-hover"><Icon name="quote-left"/> {$l('Mention')}</a>
          <a href="#action:join:{message.from}" class="on-hover"><Icon name="comments"/> {$l('Chat')}</a>
          <a href="#action:whois:{message.from}" class="on-hover"><Icon name="address-card"/> {$l('Whois')}</a>
        </div>
      {/if}
    </div>
  {/each}

  <!-- status -->
  {#if $connection.is('not_found')}
    <h2>{$l('Connection does not exist.')}</h2>
    <p>{$l('Do you want to create the connection "%1"?', $connection.connection_id)}</p>
    <p>
      <Link href="/settings/connections?uri={encodeURIComponent(conversationToUri($conversation))}" class="btn"><Icon name="thumbs-up"/> {$l('Yes')}</Link>
      <Link href="/settings/connections" class="btn is-secondary"><Icon name="thumbs-down"/> {$l('No')}</Link>
    </p>
  {:else if $conversation.is('not_found')}
    <h2>{$l('You are not part of this conversation.')}</h2>
    <p>{$l('Do you want to chat with "%1"?', $conversation.name)}</p>
    <p>
      <Link href="#action:join:{$conversation.name}" class="btn" on:click="{onMessageClick}"><Icon name="thumbs-up"/> <span>{$l('Yes')}</span></Link>
      <Link href="/settings/conversation" class="btn is-secondary"><Icon name="thumbs-down"/> <span>{$l('No')}</span></Link>
    </p>
  {:else if !$connection.is('unreachable') && $connection.frozen}
    <div class="message is-highlighted" on:click="{activeMenu.toggle}">
      <div class="message__text"><Icon name="exclamation-triangle"/> {@html $lmd('Disconnected. Your connection %1 can be edited in [settings](%2).', $connection.name, '/chat/' + $connection.connection_id + '#settings')}</div>
    </div>
  {:else if $conversation.frozen && $conversation.is('pending')}
    <h2>{$l('You are invited to join %1.', conversation.name)}</h2>
    <p>{$l('Do you want to join?')}</p>
    <p>
      <Link href="#action:join" class="btn" on:click="{onMessageClick}"><Icon name="thumbs-up"/> <span>{$l('Yes')}</span></Link>
      <Link href="#action:close" class="btn is-secondary" on:click="{onMessageClick}"><Icon name="thumbs-down"/> <span>{$l('No')}</span></Link>
    </p>
  {:else if $conversation.frozen && !$conversation.is('locked')}
    <div class="message is-highlighted">
      <div class="message__text"><Icon name="exclamation-triangle"/> {topicOrStatus($connection, $conversation)}</div>
    </div>
  {/if}

  {#if notify.wantNotifications === null}
    <div class="message is-highlighted">
      <div class="message__text"><Icon name="info-circle"/> {@html $lmd('Go to "[account settings](%1)" to enable or disable notifications.', '/settings/account')}</div>
    </div>
   {/if}

  {#if $conversation.is('loading')}
    <div class="message__status-line for-loading has-pos-bottom"><span><Icon name="spinner" animation="spin"/> <i>{$l('Loading...')}</i></span></div>
  {/if}
  {#if !$conversation.historyStopAt && $messages.length}
    <div class="message__status-line for-jump-to-now"><a href="{conversation.path}"><Icon name="external-link-alt"/> {$l('Jump to %1', now.format('%b %e %H:%M'))}</a></div>
  {/if}
</InfinityScroll>

<ChatInput conversation="{conversation}" bind:fillIn bind:focus="{focusChatInput}" bind:uploader/>

{#if $viewport.nColumns > 2 && $participants.length && !$conversation.is('not_found')}
  <div class="sidebar-right">
    <nav class="sidebar-right__nav" on:click="{onMessageClick}">
      <h3>{$l('Participants (%1)', $participants.length)}</h3>
      {#each $participants.toArray() as participant}
        <a href="#action:join:{participant.id}" class="participant {modeClassNames(participant.modes)}">
          <Icon name="pick:{participant.id}" family="solid" color="{participant.color}"/>
          <span>{participant.nick}</span>
        </a>
      {/each}
    <nav>
  </div>
{/if}
