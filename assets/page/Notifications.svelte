<script>
import ChatHeader from '../components/ChatHeader.svelte';
import Icon from '../components/Icon.svelte';
import InfinityScroll from '../components/InfinityScroll.svelte';
import Link from '../components/Link.svelte';
import {conversationUrl, gotoConversation} from '../js/chatHelpers';
import {getContext, onDestroy, onMount} from 'svelte';
import {l, lmd} from '../store/I18N';

export const title = 'Notifications';

const user = getContext('user');
const conversation = user.notifications;

$: classNames = ['main', messages.length && 'has-results'].filter(i => i);
$: messages = $conversation.messages;

  onDestroy(() => user.markNotificationsRead(); });
onMount(() => conversation.load());
</script>

<ChatHeader>
  <h1>{$l('Notifications')}</h1>
  <Link href="/settings/account" class="btn-hallow"><Icon name="user-cog"/><Icon name="times"/></Link>
</ChatHeader>

<InfinityScroll class="{classNames.join(' ')}" on:rendered="{e => e.detail.scrollTo(-1)}">
  {#if $messages.length == 0 && !conversation.is('loading')}
    <h2>{$l('No notifications.')}</h2>
  {/if}

  {#each $messages.render() as message, i}
    {#if !i || message.dayChanged}
      <div class="message__status-line for-day-changed"><span><Icon name="calendar-alt"/> <i>{message.ts.getHumanDate()}</i></span></div>
    {/if}

    <div class="{message.className}" on:click="{gotoConversation}">
      <Icon name="pick:{message.from}" color="{message.color}"/>
      <div class="message__ts has-tooltip" data-content="{message.ts.format('%H:%M')}"><div>{message.ts.toLocaleString()}</div></div>
      <a href="{conversationUrl(message)}" class="message__from" style="color:{message.color}">{$l('%1 in %2', message.from, message.conversation_id)}</a>
      <div class="message__text">{@html message.markdown}</div>
    </div>
  {/each}

  {#if $conversation.is('loading')}
    <div class="message__status-line for-loading"><span><Icon name="spinner" animation="spin"/> <i>{$l('Loading...')}</i></span></div>
  {/if}
</InfinityScroll>
