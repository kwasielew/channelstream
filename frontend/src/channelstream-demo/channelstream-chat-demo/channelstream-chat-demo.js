Polymer({

    is: 'channelstream-chat-demo',

    properties: {
        isReady: Boolean,
        user: {
            type: Object,
            value: function () {
                return {
                    username: 'Anonymous_' + String(Math.floor(Math.random() * 10000)),
                    email: ''
                }
            }
        },
        channels: {
            type: Array,
            value: function () {
                return ['pub_chan']
            }
        },
        possibleChannels: {
            type: Array,
            value: function () {
                return ['notify', 'pub_chan', 'second_channel']
            }
        },
        userState: {
            type: Object,
            value: function () {
                return {};
            },
            notify: true
        },
        usersStates: {
            type: Object,
            value: function () {
                return {};
            },
            notify: true
        },
        channelsStates: {
            type: Object,
            value: function () {
                return {};
            },
            notify: true
        }
    },
    observers: [
        'routePageChanged(routeData.page)',
        'pageChanged(page)',
        'handleUserChange(user.*)'
    ],

    /** mediator pattern pushes events from connection to chat view */
    receivedMessage: function (event) {
        var chatView = this.$$('chat-view');
        for (var i = 0; i < event.detail.length; i++) {
            var message = event.detail[i];
            if (['message', 'presence'].indexOf(message.type) !== -1) {
                chatView.addMessage(message);
            }
            // update users on presence message
            if (message.type == 'presence') {
                // push channel and user states for newly joined user
                if (message.message.action === 'joined') {
                    this.push(['channelsStates',
                        message.channel, 'users'], message.user);
                    this.set(
                        ['usersStates', message.user],
                        {state: message.state, user: message.user})

                }
                else {
                    var ix = this.channelsStates[message.channel].users.indexOf(message.user);
                    this.splice(['channelsStates', message.channel, 'users'], ix, 1);
                }
            }
        }
    },
    /** sends the message via channelstream conn manageer */
    sendMessage: function (event) {
        this.$$('channelstream-connection').message(event.detail);
    },

    /** kicks off the connection */
    ready: function () {
        this.isReady = true;
        var channelstreamConnection = this.$$('channelstream-connection');
        channelstreamConnection.connectUrl = AppConf.connectUrl;
        channelstreamConnection.disconnectUrl = AppConf.disconnectUrl;
        channelstreamConnection.subscribeUrl = AppConf.subscribeUrl;
        channelstreamConnection.unsubscribeUrl = AppConf.unsubscribeUrl;
        channelstreamConnection.messageUrl = AppConf.messageUrl;
        channelstreamConnection.longPollUrl = AppConf.longPollUrl;
        channelstreamConnection.websocketUrl = AppConf.websocketUrl;

        // add a mutator for demo purposes - modify the request
        // to inject some state vars to connection json
        channelstreamConnection.addMutator('connect', function (request) {
            request.body.state = {email: this.user.email, status: 'ready'};
        }.bind(this));
        channelstreamConnection.connect()
    },
    /** creates new connection on name change */
    handleUserChange: function () {
        if (!this.isReady) {
            return
        }
        var connection = this.$$('channelstream-connection');
        connection.disconnect();
        connection.connect();
    },
    /** subscribes/unsubscribes users from channels in channelstream */
    handleChannelsChange: function () {
        if (!this.isReady) {
            return
        }
        var connection = this.$$('channelstream-connection');
        var shouldUnsubscribe = connection.calculateUnsubscribe();
        if (shouldUnsubscribe.length > 0) {
            connection.unsubscribe(shouldUnsubscribe);
        }
        else {
            connection.subscribe();
        }
    },
    getConnection: function () {
        return this.$['channelstream-connection'];
    },

    handleConnected: function (event) {
        console.log('x', event.detail)
        this.set('userState', event.detail.state);
        this.set('channelsStates', event.detail.channels_info.channels);
        this.set('channels', event.detail.channels);
        this.updateUserStates(event.detail.channels_info);
    },
    handleSubscribed: function (event) {
        console.log('handleSubscribed');
        var channelInfo = event.detail.channels_info;
        var channelKeys = event.detail.channels;
        for (var i = 0; i < channelKeys.length; i++) {
            var key = channelKeys[i];
            this.set(['channelsStates', key], channelInfo.channels[key]);
        }
        this.set('channels', event.detail.channels);
        this.updateUserStates(channelInfo);
    },

    handleUnsubscribed: function (event) {
        var channelKeys = event.detail.unsubscribed_from;
        for (var i = 0; i < channelKeys.length; i++) {
            var key = channelKeys[i];
            this.set(['channelsStates', key], null);
        }
        this.set('channels', event.detail.channels);
    },

    /** updates channel states when we get them returned from connection elem */
    updateUserStates: function (channels_info) {
        var channel_data = channels_info.channels;
        var user_data = channels_info.users;
        var channels = Object.keys(channel_data);
        for (var i = 0; i < channels.length; i++) {
            var channel = channel_data[channels[i]];
            this.set(['channelsStates', channel.name], channel);
            for (var j = 0; j < channel.users.length; j++) {
                this.set(['usersStates', user_data[j].user], user_data[j]);
            }
        }
    },

    routePageChanged: function (page) {
        this.page = page || 'chat';
    },

    pageChanged: function (page) {
        this.set('routeData.page', this.page);
    }

});
