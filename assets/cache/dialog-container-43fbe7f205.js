riot.tag2('dialog-container', '<header> <div class="actions" if="{dialog.hasConnection()}"> <a href="#settings"><i class="material-icons">more_horiz</i></a> <a href="#participants" onclick="{listParticipants}" class="tooltipped" title="List participants"><i class="material-icons">people</i></a> <a href="#search" class="tooltipped" title="Search"><i class="material-icons">search</i></a> <a href="#close" class="tooltipped" title="Close dialog"><i class="material-icons">close</i></a> </div> <div class="actions" if="{!dialog.hasConnection()}"> <a href="#chat"><i class="material-icons">star_rate</i></a> </div> <h5 class="tooltipped" title="{dialog.topic()}">{dialog.name()}</h5> </header> <main name="scrollElement"> <ol class="collection"> <li class="{\'collection-item\': true, special: special}" each="{messages}"> <a href="{\'#autocomplete:\' + from}" class="title" if="{!special}">{from}</a> <dialog-message msg="{m}" each="{m, i in nested_messages}"></dialog-message> <span class="secondary-content" if="{special}"> <a href="#close" onclick="{removeMessage}"><i class="material-icons">close</i></a> </span> <span class="secondary-content ts tooltipped" title="{ts.toLocaleString()}" if="{!special}"> {parent.timestring(ts)} </span> </li> </ol> </main> <user-input dialog="{dialog}"></user-input>', '', '', function(opts) {
  mixin.bottom(this);
  mixin.time(this);

  this.user = opts.user;
  this.dialog = this.user.currentDialog();
  this.currentDialog = this.dialog.id();
  this.lastNumberOfMessages = 0;
  this.messages = [];

  this.listParticipants = function(e) {
    this.dialog.addMessage({special: 'users', users: this.dialog.users()});
  }.bind(this)

  this.removeMessage = function(e) {
    this.dialog.removeMessage(e.item);
  }.bind(this)

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
}, '{ }');
