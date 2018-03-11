import {ReduxMixin} from '../redux/store';
import {actions as currentActions} from '../../channelstream-admin/redux/current_actions';
import {actions as appActions} from '../redux/app';
import {actions as userActions} from '../redux/user';
import {actions as chatViewChannelActions} from '../redux/chat_view/channels';
import {actions as chatViewUsersActions} from '../redux/chat_view/users';
import {actions as chatViewMessagesActions} from '../redux/chat_view/messages';

class ChannelStreamChatDemo extends ReduxMixin(Polymer.Element) {

    static get is() {
        return 'channelstream-chat-demo';
    }

    static get properties() {
        return {
            appConfig: {
                type: Array,
                value: () => {
                    return window.AppConf;
                }
            },
            isReady: Boolean,
            user: {
                type: Object,
                statePath: 'user',
                observer: 'handleUserChange'
            },
            channels: {
                type: Array,
                statePath: 'chatView.channels'
            },

            users: {
                type: Object,
                statePath: 'chatView.users'
            },
            page: {
                type: String,
                statePath: 'app.selectedPage'
            }
        };
    }

    static get actions() {
        return {
            ...currentActions,
            setPage: appActions.setPage,
            setUserState: userActions.setState,
            setUserChannels: userActions.setChannels,
            setChannelStates: chatViewChannelActions.setChannelStates,
            delChannelState: chatViewChannelActions.delChannelState,
            setUserStates: chatViewUsersActions.setUserStates,
            setChannelMessages: chatViewMessagesActions.setChannelMessages,
            addChannelUsers: chatViewChannelActions.addChannelUsers,
            removeChannelUsers: chatViewChannelActions.removeChannelUsers
        };
    }

    changedTab(event) {
        this.dispatch('setPage', event.detail.value);
    }

    receivedMessage(event) {
        for (let message of event.detail.messages) {
            // add message
            // console.info('message', message);
            if (['message', 'presence'].indexOf(message.type) !== -1) {
                let messageMappings = {};
                // for (let channel of Object.entries(data.channels_info.channels)) {
                //     messageMappings[channel[0]] = channel[1].history;
                // }
                this.dispatch('setChannelMessages', {[message.channel]: [message]});

            }
            // update users on presence message
            if (message.type === 'presence') {
                // user joined
                if (message.message.action === 'joined') {
                    this.dispatch('setUserStates', [{user: message.user, state: message.state}]);
                    this.dispatch('addChannelUsers', message.channel, [message.user]);
                }
                // user disconnected
                else {
                    this.dispatch('removeChannelUsers', message.channel, [message.user]);
                }
            }
            if (message.type === 'user_state_change') {
                this.dispatch('setUserStates', [{user: message.user, state: message.message.state}]);
            }
        }
    }

    /** sends the message via channelstream conn manageer */
    sendMessage(event) {
        this.getConnection().message(event.detail);
    }

    changeStatus(event) {
        var stateUpdates = event.detail;
        this.getConnection().updateUserState({user_state: stateUpdates});
    }

    /** kicks off the connection */
    connectedCallback() {
        super.connectedCallback();
        this.isReady = true;
        var channelstreamConnection = this.shadowRoot.querySelector('channelstream-connection');
        channelstreamConnection.connectUrl = this.appConfig.connectUrl;
        channelstreamConnection.disconnectUrl = this.appConfig.disconnectUrl;
        channelstreamConnection.subscribeUrl = this.appConfig.subscribeUrl;
        channelstreamConnection.unsubscribeUrl = this.appConfig.unsubscribeUrl;
        channelstreamConnection.messageUrl = this.appConfig.messageUrl;
        channelstreamConnection.longPollUrl = this.appConfig.longPollUrl;
        channelstreamConnection.websocketUrl = this.appConfig.websocketUrl;
        channelstreamConnection.userStateUrl = this.appConfig.userStateUrl;

        // add a mutator for demo purposes - modify the request
        // to inject some state vars to connection json
        channelstreamConnection.addMutator('connect', function (request) {
            request.body.state = {email: this.user.email, status: 'ready'};
        }.bind(this));
        channelstreamConnection.connect();

        this._boundSubscribe = e => this.subscribeToChannel(e);
        this._boundChangeStatus = e => this.changeStatus(e);
        this.addEventListener('channelpicker-subscribe', this._boundSubscribe);
        this.addEventListener('change-status', this._boundChangeStatus);

    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this.removeEventListener('channelpicker-subscribe', this._boundSubscribe);
        this.removeEventListener('change-status', this._boundChangeStatus);
    }

    /** creates new connection on name change */
    handleUserChange(newObj, oldObj) {
        if (!this.isReady) {
            return;
        }
        if (oldObj.username === newObj.username) {
            return;
        }
        var connection = this.shadowRoot.querySelector('channelstream-connection');
        connection.disconnect();
        connection.connect();
    }

    /** subscribes/unsubscribes users from channels in channelstream */
    handleChannelsChange() {
        if (!this.isReady) {
            return;
        }
        var connection = this.shadowRoot.querySelector('channelstream-connection');
        var shouldUnsubscribe = connection.calculateUnsubscribe();
        if (shouldUnsubscribe.length > 0) {
            connection.unsubscribe(shouldUnsubscribe);
        }
        else {
            connection.subscribe();
        }
    }

    getConnection() {
        return this.$['channelstream-connection'];
    }

    handleConnected(event) {
        var data = event.detail.data;
        this.dispatch('setUserState', data.state);
        this.dispatch('setUserChannels', data.channels);
        this.dispatch('setUserStates', data.channels_info.users);
        this.dispatch('setChannelStates', data.channels_info.channels);
        let messageMappings = {};
        for (let channel of Object.entries(data.channels_info.channels)) {
            messageMappings[channel[0]] = channel[1].history;
        }
        this.dispatch('setChannelMessages', messageMappings);
    }

    subscribeToChannel(event) {
        var connection = this.getConnection();
        var channel = event.detail.channel;
        var index = this.user.subscribedChannels.indexOf(channel);
        if (index !== -1) {
            var toUnsubscribe = connection.calculateUnsubscribe([channel]);
            connection.unsubscribe(toUnsubscribe);
        }
        else {
            var toSubscribe = connection.calculateSubscribe([channel]);
            connection.subscribe(toSubscribe);
        }
    }

    handleSubscribed(event) {
        console.log('handleSubscribed');
        var data = event.detail.data;
        var channelInfo = data.channels_info;
        this.dispatch('setUserChannels', data.channels);
        this.dispatch('setUserStates', channelInfo.users);
        this.dispatch('setChannelStates', channelInfo.channels);
        let messageMappings = {};
        for (let channel of Object.entries(channelInfo.channels)) {
            messageMappings[channel[0]] = channel[1].history;
        }
        this.dispatch('setChannelMessages', messageMappings);
    }

    handleUnsubscribed(event) {
        var channelKeys = event.detail.data.unsubscribed_from;
        for (var i = 0; i < channelKeys.length; i++) {
            var key = channelKeys[i];
            this.dispatch('delChannelState', key);
        }
        this.dispatch('setUserChannels', event.detail.data.channels);
    }
}

customElements.define(ChannelStreamChatDemo.is, ChannelStreamChatDemo);
