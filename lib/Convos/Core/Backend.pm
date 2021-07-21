package Convos::Core::Backend;
use Mojo::Base 'Mojo::EventEmitter';

use Mojo::JSON qw(false true);
use Mojo::Promise;

sub connections_p {
  return Mojo::Promise->resolve([]);
}

sub delete_messages_p {
  my ($self, $obj) = @_;
  return Mojo::Promise->resolve($obj);
}

sub delete_object_p {
  my ($self, $obj) = @_;
  return Mojo::Promise->resolve($obj);
}

sub emit_to_class_p {
  my ($self, $name, @args) = @_;
  return Mojo::Promise->reject("No event handler for $name.")
    unless my $class = $self->{event_to_class}{$name};
  my $method = "handle_${name}_p";
  return $class->$method($self, @args);
}

sub load_object_p {
  my ($self, $obj) = @_;
  return Mojo::Promise->resolve($obj);
}

sub messages_p {
  my ($self, $obj, $query) = @_;
  return Mojo::Promise->resolve({end => true, messages => []});
}

sub new { shift->SUPER::new(@_)->tap('_setup') }

sub on {
  my ($self, $name, $target) = @_;
  return $self->SUPER::on($name, $target) if ref $target eq 'CODE';
  $self->{event_to_class}{$name} = $target;
  return $self;
}

sub notifications_p {
  my ($self, $user, $query) = @_;
  return Mojo::Promise->resolve({end => true, messages => []});
}

sub save_object_p {
  my ($self, $obj) = @_;
  return Mojo::Promise->resolve($obj);
}

sub users_p {
  return Mojo::Promise->resolve([]);
}

sub _setup {
  my $self = shift;

  Scalar::Util::weaken($self);
  $self->on(
    connection => sub {
      my ($self, $connection) = @_;
      my $cid = $connection->id;
      my $uid = $connection->user->id;

      Scalar::Util::weaken($self);
      $connection->on(
        message => sub {
          my ($connection, $target, $msg) = @_;

          if ($msg->{highlight} and $target->id and !$target->is_private) {
            $target->inc_notifications();
          }

          $self->emit("user:$uid",
            message =>
              {connection_id => $cid, conversation_id => $target->id, name => $target->name, %$msg}
          );
        }
      );
      $connection->on(
        state => sub {
          my ($connection, $type, $args) = @_;
          $self->emit("user:$uid", state => {connection_id => $cid, %$args, type => $type});
        }
      );
    }
  );
}

1;

=encoding utf8

=head1 NAME

Convos::Core::Backend - Convos storage backend

=head1 DESCRIPTION

L<Convos::Core::Backend> is a base class for storage backends. See
L<Convos::Core::Backend::File> for code that actually perist data.

=head1 ATTRIBUTES

L<Convos::Core::Backend> inherits all attributes from L<Mojo::EventEmitter> and
implements the following new ones.

=head1 METHODS

L<Convos::Core::Backend> inherits all methods from L<Mojo::EventEmitter> and
implements the following new ones.

=head2 connections_p

  $p = $backend->connections($user)->then(sub { my $connections = shift });

Used to find a list of connection names for a given L<$user|Convos::Core::User>.

=head2 delete_messages_p

  $p = $backend->delete_object_p($obj)->then(sub { my $obj = shift });

This method will delete all messages for a given conversation.

=head2 delete_object_p

  $p = $backend->delete_object_p($obj)->then(sub { my $obj = shift });

This method is called to remove a given object from persistent storage.

=head2 emit_to_class_p

  $p = $backend->emit_to_class_p($name => @params);

Used instead of L<Mojo::EventEmitter/emit> when you want to call a method in a
class, registered with L</on>.

  # Register a handler
  $backend->on(message_to_paste => "Convos::Plugin::Files::File");

  # Dispatch to the handler
  # Will call Convos::Plugin::Files::File->handle_message_to_paste_p()
  # with arguments ("Convos::Plugin::Files::File", $backend, @args)
  $backend->emit_to_class_p(message_to_paste => @args);

See L<Convos::Plugin::Files::File/handle_message_to_paste_p> for example
handler.

=head2 load_object_p

  $p = $backend->load_object_p($obj)->then(sub { my $obj = shift });

This method will load C<$data> for C<$obj>.

=head2 on

  $backend->on(event_name => sub { my ($backend, @args) = @_ });
  $backend->on(event_name => "Some::Class::Name");

Used to register either a class or callback to be used on an event.

See L<Mojo::EventEmitter/on> for the callback version, and L</emit_to_class_p>
for the class version.

=head2 messages_p

  $p = $backend->messages_p(\%query)->then(sub { my $res = shift; });

Used to search for messages stored in backend. The callback will be called
with the messages found.

Possible C<%query>:

  {
    after  => $datetime, # find messages after a given ISO 8601 timestamp
    before => $datetime, # find messages before a given ISO 8601 timestamp
    level  => $str,      # debug, info (default), warn, error
    limit  => $int,      # max number of messages to retrieve
    match  => $regexp,   # filter messages by a regexp
  }

C<$res> will contain:

  {
    end      => true,
    messages => [...],
  }

=head2 new

Will also call C<_setup()> after the object is created.

=head2 notifications_p

  $p = $backend->notifications_p($user, \%query)->then(sub { my $res = shift; });

This method will return notifications, in the same structure as L</messages>.

=head2 save_object_p

  $backend->save_object_p($obj)->then(sub { my $obj = shift });

This method is called to save a given object to persistent storage.

=head2 users_p

  $backend = $backend->users_p->then(sub { my $users = shift });

Used to find a list of user emails.

=head1 SEE ALSO

L<Convos::Core>

=cut
