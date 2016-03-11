<dialog-container>
  <header>
    <div class="actions" if={dialog.hasConnection()}>
      <a href="#settings" onclick={getInfo} class="tooltipped" title="Get information"><i class="material-icons">info_outline</i></a>
      <a href="#participants" onclick={listParticipants} class="tooltipped" title="List participants"><i class="material-icons">people</i></a>
      <!-- a href="#search" class="tooltipped" title="Search"><i class="material-icons">search</i></a -->
      <a href="#close" onclick={removeDialog} class="tooltipped" title="Close dialog"><i class="material-icons">close</i></a>
    </div>
    <div class="actions" if={!dialog.hasConnection()}>
      <a href="#chat"><i class="material-icons">star_rate</i></a>
    </div>
    <h5 class="tooltipped" title={dialog.topic() || 'No topic is set.'}>{dialog.name()}</h5>
  </header>
  <main name="scrollElement">
    <ol class="collection">
      <li class={liClass(m)} each={m, i in messages}>
        <dialog-message dialog={dialog} msg={nm} user={user} each={nm, i in m.nested_messages}></dialog-message>
      </li>
    </ol>
  </main>
  <user-input dialog={dialog} />
  <script>
  mixin.bottom(this);
  mixin.time(this);

  this.user = opts.user;
  this.dialog = this.user.currentDialog();
  this.currentDialog = this.dialog.id();
  this.lastNumberOfMessages = 0;
  this.messages = [];

  getInfo(e) {
    this.dialog.addMessage({special: 'info'});
  }

  liClass(i) {
    var c = ['collection-item'];
    if (i.special) c.push('special') && c.push(i.special);
    if (i.type) c.push(i.type);
    return c.join(' ');
  }

  listParticipants(e) {
    this.dialog.addMessage({special: 'users'});
  }

  removeDialog(e) {
    this.user.removeDialog(this.dialog, function(err) {
      if (err) this.dialog.addMessage({message: err[0].message});
      riot.update();
    });
  }

  removeMessage(e) {
    this.dialog.removeMessage(e.item);
  }

  this.on('update', function() {
    this.dialog = this.user.currentDialog();

    var list = this.dialog.messages();
    var messages = [];
    var prev = {ts: new Date()};

    if (this.dialog.id() != this.currentDialog) {
      this.currentDialog = this.dialog.id();
      this.dialog.trigger('show');
    }
    if (this.lastNumberOfMessages == list.length) {
      return;
    }

    this.messages = messages;
    this.lastNumberOfMessages = list.length;
    list.forEach(function(msg) {
      if (msg.from != prev.from) msg.hr = true;
      if (prev.ts.epoch() < msg.ts.epoch() - 300) msg.hr = true;
      if (msg.hr || msg.special) {
        msg.nested_messages = [msg];
        messages.push(msg);
        prev = msg;
      }
      else {
        prev.nested_messages.push(msg);
      }
    });
  });
  </script>
</dialog-container>
