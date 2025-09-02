import PropTypes from 'prop-types';
import React from 'react';
import {FormattedMessage} from 'react-intl';

import Modal from '../modal/modal.jsx';
import Box from '../box/box.jsx';

import styles from './connect-modal.css';

const ConnectModal = props => (
    <Modal
        className={styles.modalContent}
        contentLabel="Connect"
        headerClassName={styles.header}
        id="connectModal"
        onRequestClose={props.onRequestClose}
    >
        <Box className={styles.body}>
            <div className={styles.content}>
                <h2 className={styles.title}>
                    <FormattedMessage
                        defaultMessage="Connect"
                        description="Title for connect modal"
                        id="gui.connectModal.title"
                    />
                </h2>
                <p className={styles.description}>
                    <FormattedMessage
                        defaultMessage="This is the Connect overlay. You can add your connection-related content here."
                        description="Description for connect modal"
                        id="gui.connectModal.description"
                    />
                </p>
            </div>
        </Box>
    </Modal>
);

ConnectModal.propTypes = {
    onRequestClose: PropTypes.func.isRequired
};

export default ConnectModal;
