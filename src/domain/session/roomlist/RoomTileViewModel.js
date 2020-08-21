/*
Copyright 2020 Bruno Windels <bruno@windels.cloud>

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import {avatarInitials, getIdentifierColorNumber} from "../../avatar.js";
import {ViewModel} from "../../ViewModel.js";

function isSortedAsUnread(vm) {
    return vm.isUnread || (vm.isOpen && vm._wasUnreadWhenOpening);
}

export class RoomTileViewModel extends ViewModel {
    // we use callbacks to parent VM instead of emit because
    // it would be annoying to keep track of subscriptions in
    // parent for all RoomTileViewModels
    // emitUpdate is ObservableMap/ObservableList update mechanism
    constructor(options) {
        super(options);
        const {room, emitOpen} = options;
        this._room = room;
        this._emitOpen = emitOpen;
        this._isOpen = false;
        this._wasUnreadWhenOpening = false;
    }

    // called by parent for now (later should integrate with router)
    close() {
        if (this._isOpen) {
            this._isOpen = false;
            this.emitChange("isOpen");
        }
    }

    open() {
        if (!this._isOpen) {
            this._isOpen = true;
            this._wasUnreadWhenOpening = this._room.isUnread;
            this.emitChange("isOpen");
            this._emitOpen(this._room, this);
        }
    }

    compare(other) {
        const myRoom = this._room;
        const theirRoom = other._room;

        if (isSortedAsUnread(this) !== isSortedAsUnread(other)) {
            if (isSortedAsUnread(this)) {
                return -1;
            }
            return 1;
        }

        const timeDiff = theirRoom.lastMessageTimestamp - myRoom.lastMessageTimestamp;
        if (timeDiff === 0) {
            // sort alphabetically
            const nameCmp = this._room.name.localeCompare(other._room.name);
            if (nameCmp === 0) {
                return this._room.id.localeCompare(other._room.id);
            }
            return nameCmp;
        }
        return timeDiff;
    }

    get isOpen() {
        return this._isOpen;
    }

    get isUnread() {
        return this._room.isUnread;
    }

    get name() {
        return this._room.name;
    }

    // Avatar view model contract
    get avatarLetter() {
        return avatarInitials(this._room.name);
    }

    get avatarColorNumber() {
        return getIdentifierColorNumber(this._room.id)
    }

    get avatarUrl() {
        if (this._room.avatarUrl) {
            return this._room.mediaRepository.mxcUrlThumbnail(this._room.avatarUrl, 32, 32, "crop");
        }
        return null;
    }

    get avatarTitle() {
        return this.name;
    }
}
