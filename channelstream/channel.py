import copy
import logging
import six
import uuid

from datetime import datetime

import channelstream

log = logging.getLogger(__name__)


class Channel(object):
    """ Represents one of our chat channels - has some config options """

    config_keys = ['notify_presence', 'store_history', 'history_size',
                   'broadcast_presence_with_user_lists', 'notify_state',
                   'store_frames']

    def __init__(self, name, long_name=None, channel_config=None):
        """

        :param name:
        :param long_name:
        :param channel_config:
        """
        self.uuid = str(uuid.uuid4()).replace('-', '')
        self.name = name
        self.long_name = long_name
        self.last_active = datetime.utcnow()
        self.connections = {}
        self.notify_presence = False
        self.broadcast_presence_with_user_lists = False
        # channel sends all user state key changes
        self.notify_state = False
        self.salvageable = False
        self.store_history = False
        self.store_frames = True
        self.history_size = 10
        self.history = []
        # store frames for fetching when long polling connection reconnects
        self.frames = []
        if channel_config:
            self.reconfigure_from_dict(channel_config)
        log.info('%s created' % self)

    def reconfigure_from_dict(self, config):
        if config:
            for key in self.config_keys:
                val = config.get(key)
                if val is not None:
                    setattr(self, key, val)

    def add_connection(self, connection):
        username = connection.username
        if username not in self.connections:
            self.connections[username] = []

        if not self.connections[username] and self.notify_presence:
            self.send_notify_presence_info(username, 'joined')

        if connection not in self.connections[connection.username]:
            self.connections[connection.username].append(connection)
            return True
        return False

    def remove_connection(self, connection):
        was_found = False
        username = connection.username
        if username not in self.connections:
            self.connections[username] = []

        if connection in self.connections[username]:
            self.connections[username].remove(connection)
            was_found = True

        self.after_parted(username)
        return was_found

    def after_parted(self, username):
        """
        Sends parted message if necessary and removed username from
        connections if empty

        :param username:
        :return:
        """
        if not self.connections[username]:
            del self.connections[username]
            if self.notify_presence:
                self.send_notify_presence_info(username, 'parted')

    def send_notify_presence_info(self, username, action):
        """
        Sends a message to other connected parties about a presence change
        :param username:
        :param action:
        :return:
        """
        connected_users = []
        if self.broadcast_presence_with_user_lists:
            for _username in self.connections.keys():
                user_inst = channelstream.USERS.get(_username)
                user_data = {
                    'user': user_inst.username,
                    'state': user_inst.public_state
                }
                connected_users.append(user_data)

        self.last_active = datetime.utcnow()
        payload = {
            'uuid': str(uuid.uuid4()).replace('-', ''),
            'type': 'presence',
            'user': username,
            'users': connected_users,
            'timestamp': self.last_active,
            'channel': self.name,
            'message': {'action': action}
        }
        if action == 'joined':
            payload['state'] = channelstream.USERS[username].public_state
        self.add_message(payload, exclude_users=[username])
        return payload

    def send_user_state(self, user_inst, changed):
        self.last_active = datetime.utcnow()

        public_changed = [
            x for x in changed if x['key'] in user_inst.public_state
        ]

        payload = {
            'uuid': str(uuid.uuid4()).replace('-', ''),
            'type': 'user_state_change',
            'user': user_inst.username,
            'timestamp': self.last_active,
            'channel': self.name,
            'message': {'state': user_inst.public_state,
                        'changed': public_changed}
        }
        self.add_message(payload)
        return payload

    def add_message(self, message, pm_users=None, exclude_users=None):
        """
        Sends the message to all connections subscribed to this channel
        """
        message = copy.deepcopy(message)
        pm_users = pm_users or []
        exclude_users = exclude_users or []
        self.last_active = datetime.utcnow()
        no_history = message.pop('no_history', False)
        if self.store_history and message['type'] == 'message' and not no_history:
            self.history.append(message)
            self.history = self.history[self.history_size * -1:]
        if self.store_frames:
            self.frames.append(message)
            self.frames = self.frames[-100:]
        message.update({'channel': self.name})
        # message everyone subscribed except excluded
        total_sent = 0
        for user, conns in six.iteritems(self.connections):
            if not exclude_users or user not in exclude_users:
                for connection in conns:
                    if not pm_users or connection.username in pm_users:
                        connection.add_message(message)
                        total_sent += 1
        return total_sent

    def __repr__(self):
        return '<Channel: %s, connections:%s>' % (
            self.name, len(self.connections))

    def get_info(self, include_history=True, include_users=False):
        settings = {k: getattr(self, k) for k in self.config_keys}

        chan_info = {
            'uuid': self.uuid,
            'name': self.name,
            'long_name': self.long_name,
            'settings': settings,
            'history': self.history if include_history else [],
            'last_active': self.last_active,
            'total_connections': sum(
                [len(conns) for conns in self.connections.values()]),
            'total_users': 0,
            'users': []}

        for username in self.connections.keys():
            user_inst = channelstream.USERS.get(username)
            if include_users and user_inst.username not in chan_info['users']:
                chan_info['users'].append(user_inst.username)
        chan_info['users'] = sorted(chan_info['users'])
        chan_info['total_users'] = len(chan_info['users'])
        return chan_info

    def __json__(self, request=None):
        return self.get_info()
